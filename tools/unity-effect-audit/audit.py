#!/usr/bin/env python3
"""Audit a Unity effect folder against what tools/unity-quarks-exporter can carry.

Reads prefabs, materials, shaders and texture importers straight from Unity's YAML,
so it needs neither Unity nor the exporter — point it at an unzipped asset folder:

    python3 tools/unity-effect-audit/audit.py <folder> [--json]

It reports, per particle system, every module and field Unity has set that the
exporter drops or downgrades, and aggregates those into a ranked fix list. The
findings are only as good as the exporter table below: when ParticleConverter.cs
grows a case, update MODULES / SHAPE_OK to match.

Requires the project's Asset Serialization to be Force Text (Unity's default).
"""
import sys, re, json, pathlib, collections

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import uyaml

# ---- Unity enums ---------------------------------------------------------------------
SHAPE = {0: 'Sphere', 1: 'SphereShell', 2: 'Hemisphere', 3: 'HemisphereShell', 4: 'Cone',
         5: 'Box', 6: 'Mesh', 7: 'ConeShell', 8: 'ConeVolume', 9: 'ConeVolumeShell',
         10: 'Circle', 11: 'CircleEdge', 12: 'SingleSidedEdge', 13: 'MeshRenderer',
         14: 'SkinnedMeshRenderer', 15: 'BoxShell', 16: 'BoxEdge', 17: 'Donut',
         18: 'Rectangle', 19: 'Sprite', 20: 'SpriteRenderer'}
RENDER_MODE = {0: 'Billboard', 1: 'Stretch', 2: 'HorizontalBillboard', 3: 'VerticalBillboard',
               4: 'Mesh', 5: 'None'}
SORT_MODE = {0: 'None', 1: 'Distance', 2: 'OldestInFront', 3: 'YoungestInFront', 4: 'Depth'}
BLEND_FACTOR = {0: 'Zero', 1: 'One', 2: 'DstColor', 3: 'SrcColor', 4: 'OneMinusDstColor',
                5: 'SrcAlpha', 6: 'OneMinusSrcColor', 7: 'DstAlpha', 8: 'OneMinusDstAlpha',
                9: 'SrcAlphaSaturate', 10: 'OneMinusSrcAlpha'}
GRADIENT_MODE = {0: 'Blend', 1: 'Fixed', 2: 'PerceptualBlend'}
GRAD_STATE = {0: 'Color', 1: 'Gradient', 2: 'TwoColors', 3: 'TwoGradients', 4: 'RandomColor'}

# ---- what the exporter handles (mirror of ParticleConverter.cs) -----------------------
# key -> (exporter handler or None when dropped, caveat when only partial)
MODULES = {
    'InitialModule':                ('main', ''),
    'ShapeModule':                  ('BuildShape', ''),
    'EmissionModule':               ('emission', ''),
    'SizeModule':                   ('AddSizeOverLife', ''),
    'RotationModule':               ('AddRotationOverLife', 'Z axis only'),
    'ColorModule':                  ('AddColorOverLife', ''),
    'UVModule':                     ('texture sheet', 'frameOverTime curve and cycles ignored; exported as a linear sweep'),
    'VelocityModule':               ('AddVelocityOverLife', ''),
    'InheritVelocityModule':        ('AddInheritVelocity', ''),
    'LifetimeByEmitterSpeedModule': (None, 'no quarks.core equivalent'),
    'ForceModule':                  ('AddForceOverLife', ''),
    'ExternalForcesModule':         (None, 'no External Forces multiplier; only explicit ApplyForce / Turbulence'),
    'ClampVelocityModule':          ('AddLimitVelocity', ''),
    'NoiseModule':                  ('AddNoise', 'frequency and strength only; scroll speed, remap, quality, octaves dropped'),
    'SizeBySpeedModule':            ('AddSizeBySpeed', ''),
    'RotationBySpeedModule':        ('AddRotationBySpeed', ''),
    'ColorBySpeedModule':           ('AddColorBySpeed', ''),
    'CollisionModule':              ('AddCollision', 'bounce only, against a host-provided plane'),
    'TriggerModule':                (None, 'not exported'),
    'SubModule':                    ('AddSubEmitters', 'birth / death / frame triggers only'),
    'LightsModule':                 (None, 'not exported'),
    'TrailModule':                  (None, 'per-particle ribbon trails have no counterpart'),
    'CustomDataModule':             (None, 'not exported'),
}
SHAPE_OK = {'Cone', 'ConeVolume', 'Sphere', 'Hemisphere', 'Circle', 'Donut', 'Mesh'}
# Texture slots the quarks fragment shader has no sampler for.
CUSTOM_TEX_SLOTS = ('_Mask', '_Noise', '_Flow', '_Distortion')
UNITY_DEFAULT_MAX_PARTICLE_SIZE = 0.5


def is_on(m):
    return isinstance(m, dict) and m.get('enabled') in (1, True)


def gradient_peak(g):
    """Largest colour channel across a Unity Gradient's colour keys."""
    n = int(g.get('m_NumColorKeys', 0) or 0)
    peak = 0.0
    for i in range(min(n, 8)):
        k = g.get(f'key{i}') or {}
        peak = max(peak, k.get('r', 0), k.get('g', 0), k.get('b', 0))
    return peak


def minmax_gradient(mg):
    """(mode, peak channel, set of gradient interpolation modes) for a MinMaxGradient."""
    state = GRAD_STATE.get(mg.get('minMaxState', 0), '?')
    peak, modes = 0.0, set()
    if state in ('Color', 'TwoColors', 'RandomColor'):
        # Unity's .color getter reads maxColor; TwoColors uses both.
        keys = ('maxColor',) if state == 'Color' else ('maxColor', 'minColor')
        for key in keys:
            c = mg.get(key) or {}
            peak = max(peak, c.get('r', 0), c.get('g', 0), c.get('b', 0))
    else:
        keys = ('maxGradient',) if state == 'Gradient' else ('maxGradient', 'minGradient')
        for key in keys:
            g = mg.get(key) or {}
            if g:
                peak = max(peak, gradient_peak(g))
                modes.add(GRADIENT_MODE.get(g.get('m_Mode', 0), '?'))
    return state, peak, modes


def nonzero(v, keys='xyz', default=0.0):
    return any(abs((v or {}).get(a, default) - default) > 1e-4 for a in keys)


class Assets:
    """Materials, shaders and texture importers resolved through .meta GUIDs."""

    def __init__(self, root):
        self.root = root
        self.guids = uyaml.guid_map(root)
        self.materials = {}
        for p in pathlib.Path(root).rglob('*.mat'):
            m = self._material(str(p))
            if m:
                self.materials[str(p)] = m

    def _material(self, path):
        for cls, _fid, _st, _n, b in uyaml.load(path):
            if cls != 21:
                continue
            props = b.get('m_SavedProperties') or {}
            floats, texs, colors = {}, {}, {}
            for item in props.get('m_Floats') or []:
                if isinstance(item, dict):
                    floats.update(item)
            for item in props.get('m_TexEnvs') or []:
                if isinstance(item, dict):
                    for k, v in item.items():
                        t = (v or {}).get('m_Texture') or {}
                        if t.get('guid'):
                            texs[k] = t['guid']
            for item in props.get('m_Colors') or []:
                if isinstance(item, dict):
                    colors.update(item)
            sg = (b.get('m_Shader') or {}).get('guid')
            return {'name': b.get('m_Name'), 'shader_guid': sg, 'floats': floats,
                    'texs': texs, 'colors': colors,
                    'shader': pathlib.Path(self.guids[sg]).name if sg in self.guids else f'<builtin {sg}>'}
        return None

    def by_guid(self, guid):
        path = self.guids.get(guid)
        return self.materials.get(path) if path else None

    def texture(self, guid):
        path = self.guids.get(guid)
        if not path:
            return None
        meta = pathlib.Path(path + '.meta')
        if not meta.exists():
            return None
        lines = meta.read_text(encoding='utf-8', errors='replace').splitlines()

        def grab(key):
            for line in lines:
                s = line.strip()
                if s.startswith(key + ':'):
                    return s.split(':', 1)[1].strip()
            return None

        return {'file': pathlib.Path(path).name, 'sRGB': grab('sRGBTexture'),
                'alphaIsTransparency': grab('alphaIsTransparency'),
                'mipmaps': grab('enableMipMap'), 'alphaUsage': grab('alphaUsage')}


def predict_blend(mat):
    """Replicate ExportContext.DetectBlend so the report shows what it will guess."""
    if mat is None:
        return 'alpha', 'no material — DetectBlend returns 2'
    sn = (mat['shader'] or '').lower()
    if 'additive' in sn:
        return 'additive', 'shader name'
    if 'premultiply' in sn or 'alpha blend' in sn or 'alphablend' in sn:
        return 'alpha', 'shader name'
    if 'multiply' in sn or 'modulate' in sn:
        return 'multiply', 'shader name'
    f = mat['floats']
    if '_DstBlend' in f:
        dst, src = int(f['_DstBlend']), int(f.get('_SrcBlend', -1))
        if dst == 1:
            return 'additive', '_DstBlend == One'
        if src == 2:
            return 'multiply', '_SrcBlend == DstColor'
    return 'alpha', 'fallback'


def audit_system(ps, go, rend, assets):
    init = ps.get('InitialModule') or {}
    shape = ps.get('ShapeModule') or {}
    mat_ref = (rend.get('m_Materials') or [{}])[0] or {}
    mat = assets.by_guid(mat_ref.get('guid')) if mat_ref.get('guid') else None
    blend, blend_from = predict_blend(mat)

    sc_mode, sc_peak, _ = minmax_gradient(init.get('startColor') or {})
    col_mode, col_peak, col_interp = (None, 0.0, set())
    if is_on(ps.get('ColorModule')):
        col_mode, col_peak, col_interp = minmax_gradient((ps['ColorModule'] or {}).get('gradient') or {})

    entry = {
        'name': go.get('m_Name'),
        'renderMode': RENDER_MODE.get(rend.get('m_RenderMode'), rend.get('m_RenderMode')),
        'material': (mat['name'] if mat
                     else ('<none assigned>' if not mat_ref.get('guid')
                           else f"<Unity builtin {mat_ref.get('fileID')}>")),
        'shader': mat['shader'] if mat else None,
        'predictedBlend': blend, 'blendFrom': blend_from,
        'shape': SHAPE.get(shape.get('type'), shape.get('type')) if is_on(shape) else None,
        'modules': [], 'issues': [],
    }
    add = entry['issues'].append

    for key, (handler, note) in MODULES.items():
        if not is_on(ps.get(key)):
            continue
        entry['modules'].append(key)
        if handler is None:
            add(('dropped', f'{key} is enabled but not exported — {note}'))
        elif note:
            add(('partial', f'{key}: {note}'))

    # --- shape -------------------------------------------------------------------------
    if is_on(shape):
        if entry['shape'] not in SHAPE_OK:
            add(('dropped', f"Shape {entry['shape']} has no case in BuildShape — exported as a POINT emitter"))
        rot, pos, scl = shape.get('m_Rotation') or {}, shape.get('m_Position') or {}, shape.get('m_Scale') or {}
        if nonzero(rot):
            add(('dropped', f"Shape rotation {fmt_v(rot)} — neither BuildShape nor quarks.core has a shape transform"))
        if nonzero(pos):
            add(('dropped', f'Shape offset {fmt_v(pos)} — no shape transform'))
        if nonzero(scl, default=1.0):
            add(('dropped', f'Shape scale {fmt_v(scl)} — no shape transform (a scaled sphere is an ellipsoid)'))
        arc = shape.get('m_Arc') if isinstance(shape.get('m_Arc'), dict) else {}
        if arc.get('mode'):
            add(('dropped', f"Shape arc mode {arc['mode']} — ShapeBase hardcodes mode:0"))
        if shape.get('alignToDirection'):
            add(('dropped', 'Shape Align To Direction not exported'))

    # --- renderer ----------------------------------------------------------------------
    sort = SORT_MODE.get(rend.get('m_SortMode'), rend.get('m_SortMode'))
    if sort not in (None, 'None'):
        add(('dropped', f'Renderer Sort Mode = {sort} — never read; quarks does not sort particles'))
    if rend.get('m_RenderAlignment'):
        add(('dropped', f"Renderer Alignment = {rend['m_RenderAlignment']} not exported"))
    if nonzero(rend.get('m_Pivot')):
        add(('dropped', f"Renderer Pivot {fmt_v(rend['m_Pivot'])} not exported"))
    if nonzero(rend.get('m_Flip')):
        add(('dropped', f"Renderer Flip {fmt_v(rend['m_Flip'])} not exported"))
    mps = rend.get('m_MinParticleSize')
    if mps not in (None, 0):
        add(('dropped', f'Renderer Min Particle Size {mps} not exported'))
    xps = rend.get('m_MaxParticleSize')
    if xps is not None and xps < UNITY_DEFAULT_MAX_PARTICLE_SIZE:
        add(('dropped', f'Renderer Max Particle Size {xps} clamps below Unity default — not exported'))
    if rend.get('m_UseCustomVertexStreams'):
        add(('dropped', 'Custom vertex streams in use — the shader reads data quarks never sends'))
    if RENDER_MODE.get(rend.get('m_RenderMode')) == 'None' and is_on(ps.get('TrailModule')):
        add(('dropped', 'Render Mode None + Trail module — the whole system draws nothing once exported'))
    if mat is None and mat_ref.get('guid'):
        add(('partial', 'Renderer uses a Unity built-in material — the export carries Unity\'s default '
                        'particle look, not an authored one'))

    # --- main --------------------------------------------------------------------------
    if ps.get('simulationSpeed') not in (None, 1):
        add(('dropped', f"Main Simulation Speed {ps['simulationSpeed']} not exported"))
    if ps.get('scalingMode') not in (None, 0):
        add(('dropped', f"Main Scaling Mode {ps['scalingMode']} not exported"))
    if ps.get('ringBufferMode'):
        add(('dropped', 'Main Ring Buffer mode not exported'))
    if 'Fixed' in col_interp:
        add(('partial', 'Color over Lifetime gradient is Fixed (stepped) — quarks Gradient always interpolates'))
    if sc_peak > 1.001:
        add(('hdr', f'startColor peaks at {sc_peak:.2f} — HDR, needs bloom to read as authored'))
    if col_peak > 1.001:
        add(('hdr', f'colorOverLifetime peaks at {col_peak:.2f} — HDR, needs bloom to read as authored'))

    # --- material ----------------------------------------------------------------------
    if mat:
        f = mat['floats']
        emis = f.get('_Emission')
        if emis not in (None, 0, 1):
            add(('hdr', f"Material {mat['name']}: _Emission = {emis} — a shader HDR multiplier the exporter never reads"))
        if f.get('_Depthpower') not in (None, 0):
            add(('dropped', f"Material {mat['name']}: _Depthpower = {f['_Depthpower']} (soft particles) not exported"))
        if f.get('_Opacity') not in (None, 1):
            add(('dropped', f"Material {mat['name']}: _Opacity = {f['_Opacity']} not exported"))
        for slot in CUSTOM_TEX_SLOTS:
            if mat['texs'].get(slot):
                add(('shader', f"Material {mat['name']}: texture slot {slot} bound — the quarks shader samples only `map`"))
        if '_SrcBlend' in f:
            entry['unityBlend'] = (f"{BLEND_FACTOR.get(int(f['_SrcBlend']), f['_SrcBlend'])} / "
                                   f"{BLEND_FACTOR.get(int(f.get('_DstBlend', -1)), f.get('_DstBlend'))}")
        mt = mat['texs'].get('_MainTex')
        if mt:
            tex = assets.texture(mt)
            entry['mainTex'] = tex
            if tex and tex.get('sRGB') == '1':
                add(('colorspace', f"Main texture {tex['file']} is sRGB — Unity samples it into linear, the quarks shader does not"))
    return entry


def fmt_v(v):
    return '(' + ', '.join(f"{(v or {}).get(a, 0):g}" for a in 'xyz') + ')'


def run(root):
    assets = Assets(root)
    effects = []
    for pf in sorted(pathlib.Path(root).rglob('*.prefab')):
        docs = uyaml.load(str(pf))
        gos = {fid: b for cls, fid, _s, _n, b in docs if cls == 1}
        rends = {str((b.get('m_GameObject') or {}).get('fileID')): b
                 for cls, _fid, _s, _n, b in docs if cls == 199}
        systems = []
        for cls, _fid, _s, _n, ps in docs:
            if cls != 198:
                continue
            gid = str((ps.get('m_GameObject') or {}).get('fileID'))
            systems.append(audit_system(ps, gos.get(gid) or {}, rends.get(gid) or {}, assets))
        if systems:
            effects.append({'prefab': pf.name, 'systems': systems})
    return effects


def cause(text):
    """Collapse a finding to its cause so the ranked table counts reasons, not values."""
    t = re.sub(r'^Material [^:]+: ', '', text)
    t = t.split(' — ')[0]
    t = re.sub(r'\(-?[\d.]+, -?[\d.]+, -?[\d.]+\)', '(...)', t)
    t = re.sub(r'\b\d+(\.\d+)?\b', 'N', t)
    t = re.sub(r'^Main texture \S+ is sRGB$', 'Main texture is sRGB', t)
    return t.strip()


def markdown(effects):
    total = sum(len(e['systems']) for e in effects)
    buckets = collections.Counter()
    where = collections.defaultdict(set)
    for e in effects:
        for s in e['systems']:
            for kind, text in {(k, cause(x)) for k, x in s['issues']}:
                buckets[(kind, text)] += 1
                where[(kind, text)].add(e['prefab'])

    out = [f'# Unity export audit\n',
           f'{total} particle systems across {len(effects)} prefabs.\n',
           '## Ranked findings\n',
           '| systems | prefabs | kind | finding |', '| ---: | ---: | --- | --- |']
    for (kind, text), n in buckets.most_common():
        out.append(f'| {n} | {len(where[(kind, text)])} | {kind} | {text} |')

    out.append('\n## Per effect\n')
    for e in effects:
        out.append(f"### {e['prefab']}\n")
        for s in e['systems']:
            out.append(f"**{s['name']}** — {s['renderMode']}, shape {s['shape']}, "
                       f"material `{s['material']}`, blend {s['predictedBlend']} ({s['blendFrom']})"
                       + (f", Unity {s['unityBlend']}" if s.get('unityBlend') else ''))
            for kind, text in s['issues']:
                out.append(f'  - `{kind}` {text}')
            out.append('')
    return '\n'.join(out)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        sys.exit(2)
    result = run(args[0])
    print(json.dumps(result, indent=1, default=str) if '--json' in sys.argv else markdown(result))
