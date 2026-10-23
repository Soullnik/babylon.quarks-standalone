# Changelog

All notable changes to the `babylon.quarks-editor` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

## [0.27.1] — 2026-10-23

### Changed

- **Peer ranges:** `@babylonjs/core` and `@babylonjs/materials` are `^9.0.0` instead of
  `>=9.0.0`. `babylon.quarks` stays `~0.27.0`: the editor follows the library's minor line, and
  the release check now enforces it.
- The `exports` map lists `types` first and exports `./package.json`. The README says the package
  is ES modules only.

## [0.27.0] — 2026-10-23

A 0.27.0 dated 2026-10-21 was prepared but never published; its entries are folded in here.

### Added

- Main module: "Warm-up time", shown while Prewarm is on, the seconds of the cycle simulated
  before the first frame (`prewarmTime`; 0 warms up a whole cycle).
- **The Renderer module reaches the 0.25–0.26 texture features.** Map layout (UV channel,
  tiling, offset, scroll), Flip, a Gradient map section (ramp and channel), an Erosion section
  (mask with its own layout, softness, edge width and colour) and a UV distortion section (noise
  with its layout, strength). The ramp, mask and noise are picked the way the texture is: from
  the host's presets, a URL or a file.
- Renderer: a swept trail's side axis. A host geometry
  (`GeometryOption`, `resolveGeometry`) may carry a second UV set, `uvs2`, which mesh particles
  read on UV channel 1; the demo's glTF loader passes `TEXCOORD_1` through.
- Main: Scaling mode for world-space systems (shape only, or the hierarchy's motion too).
- Texture Sheet Animation: time mode (lifetime or FPS), FPS, loop or hold, random frame, cycles,
  frame count and a random start frame.
- Attractor module: a point gravity (`GravityForce`) with its centre and strength.
- Emitter shape wireframes for the Box and Edge shapes: the box outline with its +Z emit
  direction, and the edge line with its +Y emit direction.
- `TextureSelect` and `TextureUVField` components, exported from `babylon.quarks-editor/react`.
- Renderer module, trails: "Tessellation" and "Curve tension".

### Changed

- Renderer, trails: "Texture mode" (stretch, distribute per segment, tile, repeat per segment),
  "Texture scale", "Min vertex distance" and "Trail time", each left unset at its default so the
  JSON stays sparse. The "Head width scale" row is gone: it wrote a `headWidthScale` field no
  runtime read (the head's width comes from the Width over Trail module).
- **`TimelinePanelProps` and `TransportBarProps` take `RefObject<HTMLElement | null>` refs**, the
  type `useRef<HTMLElement>(null)` returns, now that the editor compiles with `strict`. Code that
  passed the old type still compiles.

### Fixed

- An imported effect whose images were inlined from the picked files is saved with those inlined
  images; `serializeEffect` writes a texture's source path only while the texture still shows the
  image it was loaded with, and an inlined image has no path. A test covers import → scene → save.
- **Saving lost mesh nodes and texture settings.** The editor now saves through `serializeEffect`:
  mesh nodes keep their geometry (so mesh surface emitters still emit after a save and reload),
  and textures keep their wrap, sampling, repeat, offset and rotation. Textures with no url a file
  can point at are reported instead of written as an empty entry.
- The yellow hover ring stayed on the ground after the hovered effect was removed from the scene.
- **Node ESM and webpack 5 could not import the package.** `dist` was compiled with relative and
  `@babylonjs` deep imports that had no file extension. Every import now ends in `.js`.
- The `babylon.quarks` peer range was `>=0.17.0`, but the editor needs current APIs (beam mode,
  rim fade, culling and sort settings). It is now `~0.27.0`.

### Internal

- Jest tests now cover the whole editor core (`src/core`): systems, material, timeline, scrub,
  playback and transport, groups, collision, effect tree, assets and asset tree, scene entries,
  gallery layout, playback, markers and picker, emitter shape wireframes, texture export and the
  IndexedDB project store. The coverage threshold for the editor is raised to match.
- Editor tests resolve `babylon.quarks` to its sources, so they pick up library changes made in
  the same branch without rebuilding it.
- React modules are tested in jsdom through the DOM, and the whole `EffectEditor` is mounted in
  every render mode.
- The README leads with `QuarksEffectEditor.Show`, lists every peer and every module, and the
  `EffectEditor` snippet carries all of its props.

## [0.26.0] — 2026-10-21

### Added

- Renderer module: rim mode "Fade (faces fade, edges stay)".

## [0.25.0] — 2026-10-20

### Added

- Renderer module: "Beam (end set in code)" render mode. The beam's end is a runtime property
  (`ParticleSystem.beamEnd`), so in the editor a beam has no length and draws nothing.

## [0.24.1] — 2026-10-20

### Fixed

- With Babylon 9.31 the viewport lost its ground grid (the whole plane drew in flat grey) and the
  gizmos, viewport selection and drop-to-place stopped responding: 9.31's grid needs `linesOnly`
  for what opacity below 1 used to do, and `scene.pick` now needs `@babylonjs/core/Culling/ray`
  imported for its side effect, which the editor now does.

## [0.24.0] — 2026-10-20

### Added

- Main module: "Playback speed", "Fixed seed" (the system's random seed, for an effect that plays
  out identically every time) and "Off screen" (the system's culling mode: always simulate, pause,
  pause and catch up). Renderer module: "Rendering group", "Apply fog", "Sort mode" and "Limit
  screen size" (min / max particle size as fractions of the viewport). Shape module: "Align to
  direction". Noise module: "Scroll speed" and "Remap" (with its curve). Velocity module: "Orbital
  offset" and "Radial". Sub Emitters module: "Inherit color / size / rotation / lifetime".
- The editor now reaches everything the runtime can do. Shape module: Box (with emit from
  volume / shell / edges) and Edge shapes. Main module: "Blend between two" start colour
  (`ColorRange`) and "3D (axis + angle)" start rotation (`AxisAngleGenerator`). New modules:
  "Rotation over Lifetime (3D)" for mesh particles (axis + angle, per axis, random) and
  "Sequences" (`ApplySequences`: sequences read from an image's opaque pixels, with time window,
  scale and position). Renderer module: "Layer mask", "Max particles", billboard "Pivot", the
  trail flags (record in world space, UV from head, color from particle, die with particle, head
  width scale) and, for meshes, an environment-map atlas picked from the host's textures with its
  reflection level.
- "Random between two" fields label their min and max inputs. Export and Save warn when the
  effect references `blob:` textures, which do not survive a reload.

## [0.23.0] — 2026-10-18

### Added

- The projects page shows the host's `backLink` (the same one the editor viewport shows), so a
  workspace embedded in a site can be left for the hosting page without the browser's back button.

### Changed

- Version aligned with babylon.quarks 0.23.0, whose simulation now runs on store columns; the
  editor's preview and gallery get the same speed-up with no editor changes.

## [0.22.0] — 2026-10-17

### Added

- Renderer module: a "Lighting" selector for mesh particles (`fixed` / `unlit` / `scene`) and
  rim (Fresnel) controls — colour, power, strength, add or mix.
- Width over Trail module: an "Absolute width" checkbox for `WidthOverLength`'s `absolute`
  flag (the curve as world-unit widths, the pre-0.22 reading).

## [0.21.0] — 2026-10-16

### Changed

- Asset folder import inlines external textures and geometries through
  `QuarksLoader.resolveLinkedResources` and a File-backed `QuarksResourceResolver`, matching the
  runtime loader path instead of a private `resolveExternalGeometries` helper.

## [0.20.0] — 2026-10-16

### Added

- **Projects**: a start page lists the projects saved in IndexedDB (new, rename, duplicate,
  delete), with storage usage and a "make storage persistent" button. `ProjectStore` with an
  `IndexedDbProjectStore` default keeps each texture once per project by content hash. The scene
  is saved explicitly (Save / Ctrl+S, `*` while unsaved), and assets are written as they change.
- **Scene and Assets panels**: the Scene panel lists only the effects placed in the viewport
  (show/hide, solo, delete, "Save as new asset…"), and the Assets drawer holds the library.
- **Prefab mode**: open an asset to edit it on its own, with the scene set aside. Double-clicking
  another asset swaps it in place, asking Save / Don't save / Cancel when there are unsaved edits.
- **Effect tree** in the Scene and prefab panels: each effect unfolds into its group/emitter tree,
  and clicking a node selects it for the inspector and gizmo, sub-emitters included, without
  opening the timeline.

### Changed

- Selecting a node no longer stalls the viewport: the inspector renders after the selection
  instead of in the same frame, cutting main-thread blocking per switch from ~50 ms to ~15–19 ms.

### Fixed

- The camera renders only above the floating Assets drawer, so a focused effect or an opened
  prefab is centred where it can be seen.
- Selection rings rendered nothing under Vite's dev server: the color shaders they use are now
  registered up front instead of being fetched at runtime.

## [0.17.9] — 2026-07-14

### Added

- **Effect gallery** — catalog panel with folder import, virtualized tree, drag-and-drop into
  the viewport, and multi-effect scene layout.
- **Preview set vs focus** — checkbox / Ctrl+click adds effects to stage preview; click selects
  one effect for the inspector and timeline (Unity-style).
- **Stage vs focus playback** — stage Play/Pause drives all preview effects; timeline
  playhead/scrub/restart apply only to the focused effect. One-shot focus parks at the end
  without stopping looping previews.
- `core/playback.ts` — decoupled `stagePlaying`, per-root `focusElapsed`, and `focusFinished`
  state.
- `scrubFocusTo()` — scrubs only the focused binding via `system.update()` without advancing
  other previews through the shared renderer.
- Gallery scene helpers — drop marker, selection marker, emitter-shape wireframes, camera
  focus on select.
- **Inspector tooltips** — info icons on module titles and field labels with English
  descriptions (`inspectorHints.ts`); themed portal tooltips (`Tooltip` / `InspectorInfoIcon`).
- `pickGalleryJsonFiles()` — native folder picker via File System Access API when available.
- `MessageDialog`, Heroicons-based toolbar/gallery icons, `@tanstack/react-virtual` for the
  gallery list.

### Changed

- `EffectEditorHost` — gallery state, preview set, transport counter, render loop wired to
  the new playback model.
- `TimelinePanel` — stage transport controls, focus-only restart/scrub, catalog-only disabled
  state with drop hint.
- `galleryPlayback` — `play()` on all systems in preview entries (including sub-emitters).
- `binding.restart()` — also calls `play()` on sub-emitter systems.
- `RendererModule` — material metadata display and patch helpers; timeline span uses duration
  only (no particle-life tail).
- Burst editor rows in Emission module use shared `Row` layout with tooltips.

### Fixed

- Finishing a one-shot **focused** effect no longer pauses looping effects in the preview set.
- `pickGalleryFiles.ts` — TypeScript typing for directory `entries()` without invalid
  `extends FileSystemDirectoryHandle` override.

### Related: Unity exporter 0.2.0

- Batch **Export Folder of Effects to JSON** pairs with the editor gallery folder import
  (export a tree of prefabs in Unity → import the folder in the effect editor catalog).

## [0.17.7] — 2026-07-09

### Added

- First npm release. Shuriken-style effect editor for `babylon.quarks`: headless edit-model
  core (`.` export) plus an embeddable React UI (`./react` export) — hierarchy panel, stacked
  module inspector, undo/redo, JSON import/export round-tripping through `QuarksLoader`.
