# Unity effect audit

Static audit of a Unity effect folder against what
[`unity-quarks-exporter`](../unity-quarks-exporter) can actually carry across.

```bash
python3 tools/unity-effect-audit/audit.py /path/to/unzipped/effects        # markdown report
python3 tools/unity-effect-audit/audit.py /path/to/unzipped/effects --json # machine-readable
```

Needs Python 3 with PyYAML, and nothing else — **no Unity, no Unity licence, no exporter run**.
Unity serializes prefabs, materials, shader graphs and texture importers as YAML, so the whole
effect description can be read off disk. Point it at an unzipped asset folder (prefabs, `.mat`
files, textures and their `.meta` files all present — the `.meta` files are what resolve GUID
references to real files).

The project must be on **Force Text** asset serialization, which is Unity's default
(Edit → Project Settings → Editor → Asset Serialization).

## What it reports

Per particle system: render mode, shape, material, the blend mode
`ExportContext.DetectBlend` would infer next to the material's real `_SrcBlend`/`_DstBlend`,
and every finding, tagged by kind:

| kind | meaning |
| --- | --- |
| `dropped` | Unity has this set and the exporter emits nothing for it |
| `partial` | exported, but with known loss (a resampled curve, one axis of three) |
| `hdr` | values above 1.0 that only read correctly through bloom |
| `colorspace` | sRGB source data the quarks shader samples without conversion |
| `shader` | a custom shader feature the quarks fragment shader has no counterpart for |

Findings are then aggregated into a table ranked by how many systems each cause affects, which is
the point of the tool: it reweights the fix list by what the effects in front of you actually use
rather than by what the parity checklist says is missing.

## Keeping it honest

The exporter's capabilities are mirrored in `MODULES`, `SHAPE_OK` and `CUSTOM_TEX_SLOTS` at the top
of `audit.py`. They are a hand-maintained copy of `ParticleConverter.cs` and `ExportContext.cs`;
when the exporter grows a case, update them or the report will claim losses that no longer happen.

`predict_blend` is likewise a replication of `DetectBlend`. It is worth re-reading both together
whenever either changes — a silent divergence there makes every blend column in the report wrong.
