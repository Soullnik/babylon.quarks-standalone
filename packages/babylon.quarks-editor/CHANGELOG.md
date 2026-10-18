# Changelog

All notable changes to the `babylon.quarks-editor` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

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
