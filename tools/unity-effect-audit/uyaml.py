"""Minimal Unity YAML reader: splits the `--- !u!<class> &<id>` documents and
loads each with PyYAML, ignoring Unity's custom tags and stripped markers."""
import re, yaml, pathlib

DOC = re.compile(r'^--- !u!(\d+) &(-?\d+)(?: (stripped))?\s*$', re.M)

class _L(yaml.SafeLoader):
    pass
# Unity emits tags like !u!114 inside docs occasionally; swallow anything unknown.
_L.add_multi_constructor('', lambda loader, suffix, node: None)
_L.add_multi_constructor('tag:unity3d.com,2011:', lambda loader, suffix, node: None)

def load(path):
    """Return list of (classId:int, fileId:str, stripped:bool, name:str, body:dict)."""
    text = pathlib.Path(path).read_text(encoding='utf-8', errors='replace')
    marks = [(m.start(), m.end(), int(m.group(1)), m.group(2), bool(m.group(3))) for m in DOC.finditer(text)]
    out = []
    for i, (s, e, cls, fid, stripped) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        chunk = text[e:end]
        try:
            body = yaml.load(chunk, Loader=_L)
        except Exception as ex:
            out.append((cls, fid, stripped, None, {'__parse_error__': str(ex)}))
            continue
        if not isinstance(body, dict) or not body:
            out.append((cls, fid, stripped, None, {}))
            continue
        name = next(iter(body))
        out.append((cls, fid, stripped, name, body[name] if isinstance(body[name], dict) else {}))
    return out

def guid_map(root):
    """guid -> asset path, from every .meta file under root."""
    g = {}
    for meta in pathlib.Path(root).rglob('*.meta'):
        try:
            for line in meta.read_text(encoding='utf-8', errors='replace').splitlines():
                if line.startswith('guid: '):
                    g[line[6:].strip()] = str(meta)[:-5]
                    break
        except Exception:
            pass
    return g
