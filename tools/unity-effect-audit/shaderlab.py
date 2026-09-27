"""Reads the blend state out of ShaderLab source.

Mirror of ExportContext.TryReadShaderSourceBlend in the exporter — keep the two in step.
It is a parser for the ShaderLab language, not a keyword search: `Blend` and `BlendOp` are
read as statements, with their grammar, from the first SubShader's passes, honouring state
inherited from enclosing Category / SubShader blocks. Program blocks (CGPROGRAM … ENDCG and
friends), comments and string literals are skipped, so shader code that happens to mention
the word never matches.
"""
import re

PROGRAM_BLOCKS = {
    'CGPROGRAM': 'ENDCG', 'CGINCLUDE': 'ENDCG',
    'HLSLPROGRAM': 'ENDHLSL', 'HLSLINCLUDE': 'ENDHLSL',
    'GLSLPROGRAM': 'ENDGLSL', 'GLSLINCLUDE': 'ENDGLSL',
}
# ShaderLab blend-factor keywords → UnityEngine.Rendering.BlendMode values.
FACTORS = {'zero': 0, 'one': 1, 'dstcolor': 2, 'srccolor': 3, 'oneminusdstcolor': 4,
           'srcalpha': 5, 'oneminussrccolor': 6, 'dstalpha': 7, 'oneminusdstalpha': 8,
           'srcalphasaturate': 9, 'oneminussrcalpha': 10}
# ShaderLab BlendOp keywords → UnityEngine.Rendering.BlendOp values. ShaderLab spells
# subtract "Sub" / "RevSub", which is why this is not an enum-name parse.
OPS = {'add': 0, 'sub': 1, 'revsub': 2, 'min': 3, 'max': 4}
OP_UNSUPPORTED = -2


def lex(text):
    """Tokens as (kind, value): 'w' word, 's' string, 'p' punctuation."""
    toks, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif text.startswith('//', i):
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = n if j < 0 else j + 2
        elif c == '"':
            j = text.find('"', i + 1)
            j = n if j < 0 else j
            toks.append(('s', text[i + 1:j]))
            i = j + 1
        elif c in '{}[](),=':
            toks.append(('p', c))
            i += 1
        else:
            j = i
            while j < n and (text[j].isalnum() or text[j] in '_.-+'):
                j += 1
            if j == i:
                i += 1
                continue
            word, i = text[i:j], j
            end = PROGRAM_BLOCKS.get(word.upper())
            if end:
                m = re.compile(r'\b' + end + r'\b').search(text, i)
                i = n if m is None else m.end()
                continue
            toks.append(('w', word))
    return toks


def _factor(toks, pos):
    """`[_Prop]` → ('prop', name); `SrcAlpha` → ('lit', word); else (None, pos)."""
    if pos < len(toks) and toks[pos] == ('p', '['):
        if pos + 2 < len(toks) and toks[pos + 1][0] == 'w' and toks[pos + 2] == ('p', ']'):
            return ('prop', toks[pos + 1][1]), pos + 3
        return None, pos + 1
    if pos < len(toks) and toks[pos][0] == 'w':
        return ('lit', toks[pos][1]), pos + 1
    return None, pos


def _is_off(toks, pos):
    return pos < len(toks) and toks[pos][0] == 'w' and toks[pos][1].lower() == 'off'


def _render_target(toks, pos):
    """Optional render-target index before the factors (`Blend 1 One One`)."""
    if pos < len(toks) and toks[pos][0] == 'w' and toks[pos][1].isdigit():
        return int(toks[pos][1]), pos + 1
    return 0, pos


def _blend(toks, pos):
    """Blend Off | Blend [rt] src dst [, srcA dstA]. Only render target 0 counts."""
    rt, pos = _render_target(toks, pos)
    if _is_off(toks, pos):
        return (('off',) if rt == 0 else None), pos + 1
    src, pos = _factor(toks, pos)
    dst, pos = _factor(toks, pos)
    if pos < len(toks) and toks[pos] == ('p', ','):
        _, pos = _factor(toks, pos + 1)
        _, pos = _factor(toks, pos)
    if src is None or dst is None or rt != 0:
        return None, pos
    return ('factors', src, dst), pos


def _blend_op(toks, pos):
    """BlendOp [rt] op [, opA]."""
    rt, pos = _render_target(toks, pos)
    op, pos = _factor(toks, pos)
    if pos < len(toks) and toks[pos] == ('p', ','):
        _, pos = _factor(toks, pos + 1)
    return (op if rt == 0 else None), pos


def _block(toks, pos, kind):
    node = {'kind': kind, 'blend': None, 'op': None, 'children': []}
    last_word = None
    while pos < len(toks):
        t, v = toks[pos]
        if (t, v) == ('p', '}'):
            return node, pos + 1
        if (t, v) == ('p', '{'):
            child, pos = _block(toks, pos + 1, (last_word or '').lower())
            node['children'].append(child)
            last_word = None
            continue
        if t == 'w' and v.lower() == 'blend':
            stmt, pos = _blend(toks, pos + 1)
            if stmt is not None and node['blend'] is None:
                node['blend'] = stmt
            last_word = None
            continue
        if t == 'w' and v.lower() == 'blendop':
            stmt, pos = _blend_op(toks, pos + 1)
            if stmt is not None and node['op'] is None:
                node['op'] = stmt
            last_word = None
            continue
        if t == 'w':
            last_word = v
        pos += 1
    return node, pos


def _first_subshader(node, blend, op):
    for child in node['children']:
        if child['kind'] == 'subshader':
            return child, blend, op
        if child['kind'] in ('shader', 'category'):
            found = _first_subshader(child, child['blend'] or blend, child['op'] or op)
            if found:
                return found
    return None


def blend_statement(text):
    """
    The blend state the first SubShader renders with, unresolved:
      None                              — not ShaderLab, or no SubShader
      ('off',)                          — the shader does not blend
      ('factors', src, dst, op-or-None) — each a ('lit', word) or ('prop', name)

    The pass used is the first one that blends — a leading depth-only or `Blend Off` pass is
    skipped rather than mistaken for the colour pass.
    """
    toks = lex(text)
    if not toks or toks[0][0] != 'w' or toks[0][1].lower() != 'shader':
        return None
    root, _ = _block(toks, 0, '')
    found = _first_subshader(root, None, None)
    if not found:
        return None
    sub, inherited_blend, inherited_op = found
    blend = sub['blend'] or inherited_blend
    op = sub['op'] or inherited_op
    passes = [c for c in sub['children'] if c['kind'] == 'pass']
    if not passes:
        chosen = [(blend, op)]
    else:
        chosen = [(p['blend'] or blend, p['op'] or op) for p in passes]
    for b, o in chosen:
        if b and b[0] == 'factors':
            return ('factors', b[1], b[2], o)
    return ('off',)


def resolve(statement, read_float):
    """
    Turn a blend_statement into (src, dst, op) ints, reading [_Prop] references through
    read_float(name) → float | None. Returns None when a reference is not readable.
    """
    if not statement or statement[0] != 'factors':
        return None
    _, src, dst, op = statement

    def factor(f):
        kind, value = f
        if kind == 'prop':
            v = read_float(value)
            return None if v is None else int(v)
        return FACTORS.get(value.lower())

    def operation(o):
        if o is None:
            return 0
        kind, value = o
        if kind == 'prop':
            v = read_float(value)
            return None if v is None else int(v)
        return OPS.get(value.lower(), OP_UNSUPPORTED)

    s, d, o = factor(src), factor(dst), operation(op)
    if s is None or d is None or o is None:
        return None
    return s, d, o


# ---- declared properties -----------------------------------------------------------------------

# ShaderLab property types that are textures.
TEXTURE_TYPES = {'2d', '3d', 'cube', '2darray', 'cubearray', 'any'}


def properties(text):
    """
    Properties a ShaderLab shader declares, as {name: {'type': str, 'main': bool}}, or None when
    `text` is not ShaderLab. `main` marks the [MainTexture] attribute.
    Grammar: [Attr(...)]* _Name ("Display", Type) = default
    """
    toks = lex(text)
    if not toks or toks[0][0] != 'w' or toks[0][1].lower() != 'shader':
        return None
    # find the Properties block
    i = 0
    while i < len(toks) and not (toks[i][0] == 'w' and toks[i][1].lower() == 'properties'):
        i += 1
    if i + 1 >= len(toks) or toks[i + 1] != ('p', '{'):
        return {}
    i += 2
    out, attrs, depth = {}, [], 0
    while i < len(toks):
        t, v = toks[i]
        if (t, v) == ('p', '{'):
            depth += 1
        elif (t, v) == ('p', '}'):
            if depth == 0:
                break
            depth -= 1
        elif depth == 0 and (t, v) == ('p', '['):
            # attribute: [Name] or [Name(args)]
            j = i + 1
            if j < len(toks) and toks[j][0] == 'w':
                attrs.append(toks[j][1])
            nest = 1
            while j < len(toks) and nest:
                if toks[j] == ('p', '['):
                    nest += 1
                elif toks[j] == ('p', ']'):
                    nest -= 1
                j += 1
            i = j
            continue
        elif (depth == 0 and t == 'w' and i + 4 < len(toks) and toks[i + 1] == ('p', '(')
              and toks[i + 2][0] == 's' and toks[i + 3] == ('p', ',') and toks[i + 4][0] == 'w'):
            out[v] = {'type': toks[i + 4][1].lower(), 'main': 'MainTexture' in attrs}
            attrs = []
            # skip to the end of the declaration's parenthesis
            nest, j = 0, i + 1
            while j < len(toks):
                if toks[j] == ('p', '('):
                    nest += 1
                elif toks[j] == ('p', ')'):
                    nest -= 1
                    if nest == 0:
                        break
                j += 1
            i = j + 1
            continue
        i += 1
    return out


# Shader Graph property object types that hold a texture.
GRAPH_TEXTURE_TYPES = {'Texture2DShaderProperty', 'Texture3DShaderProperty', 'CubemapShaderProperty',
                       'Texture2DArrayShaderProperty', 'VirtualTextureShaderProperty'}


def graph_properties(text):
    """
    Properties a Shader Graph declares, as {reference: {'type': 'texture'|'other', 'main': bool}},
    or None when `text` is not a Shader Graph (a stream of JSON objects).
    """
    import json
    s = text.lstrip('﻿ \t\r\n')
    if not s.startswith('{'):
        return None
    dec, i, objs = json.JSONDecoder(), 0, []
    try:
        while i < len(s):
            while i < len(s) and s[i].isspace():
                i += 1
            if i >= len(s):
                break
            obj, i = dec.raw_decode(s, i)
            objs.append(obj)
    except ValueError:
        return None
    out = {}
    for o in objs:
        kind = str(o.get('m_Type', '')).rsplit('.', 1)[-1]
        if not kind.endswith('ShaderProperty'):
            continue
        ref = o.get('m_OverrideReferenceName') or o.get('m_DefaultReferenceName')
        if ref:
            out[ref] = {'type': 'texture' if kind in GRAPH_TEXTURE_TYPES else 'other',
                        'main': bool(o.get('isMainTexture'))}
    return out
