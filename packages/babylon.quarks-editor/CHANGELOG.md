# Changelog

All notable changes to the `babylon.quarks-editor` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

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
