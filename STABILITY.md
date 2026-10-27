# Stability

What babylon.quarks promises from 1.0 on, and what it does not. The package follows
[semantic versioning](https://semver.org/): a patch fixes, a minor adds, and only a major breaks.
This page says what "breaks" means for the API, the effect files and the look of an effect.

It covers `babylon.quarks` and the effect format. `babylon.quarks-editor` stays on 0.x, see
[The editor](#the-editor).

## The API

The public API is what the `babylon.quarks` entry point exports. Its TypeScript surface is
recorded in
[`packages/babylon.quarks/api/babylon.quarks.api.md`](packages/babylon.quarks/api/babylon.quarks.api.md),
and CI fails a change to it that does not update the report, so every change to the surface shows
in review.

Within 1.x:

- **Nothing public is removed or renamed**, and no parameter, property or return type changes in a
  way that stops code that compiled against an earlier 1.x from compiling or running as before.
- **Additions are minors:** a new export, a new optional parameter or setting, a new member of a
  union or enum the caller passes in. A new member of a union or enum the library hands back, such
  as a new render mode, is an addition too: code that switches over one should have a default case.
- **Interfaces you implement** (`Behavior`, `EmitterShape`, the value and colour generators,
  `PhysicsResolver`) only gain optional members, with a default for code that leaves them out.
- **Defaults do not change.** An unset setting means the same in every 1.x.
- **Not covered:**
  - Members tagged `@internal`, and anything under `src/` that no entry point exports. They are
    public in TypeScript only so the package's own files can reach them.
  - Types a public signature reaches but no entry point exports: the report lists them as
    `ae-forgotten-export`. Most are quarks.core's math (`Vector3`, `Vector4`, `Quaternion`,
    `Matrix4` and the rest), which the particle state, generators and read-back values such as
    `ConstantColor.color` use. Their fields (`x`, `y`, `z`, `w`, and `r`, `g`, `b`, `a` on
    colours) and the methods [Extending babylon.quarks](docs/EXTENDING.md) uses are covered; the
    rest of each class is not.
  - Private members reached through `obj['member']`, the generated shader sources, and the
    names of materials, meshes and buffers the renderer creates.
  - The order and timing of internal calls, beyond what the TSDoc says.

[Extending babylon.quarks](docs/EXTENDING.md) is the contract for custom behaviors, shapes and
plugins: what it shows keeps working in every 1.x, and its examples run as tests. A minor may add
built-in behaviors and shapes, and a built-in wins over a plugin's of the same `type`, so give
yours a prefixed name (`'my.Drag'`).

### Deprecation

An API that gives way to a better one is marked `@deprecated` in its TSDoc, with the replacement
named, and listed under **Deprecated** in the changelog of the minor that does it. It keeps working
as before until the next major, which removes it and lists it under **Breaking** with the
replacement. Nothing is deprecated in 1.0.

### Toolchain

The declarations are built with TypeScript 6. A minor may raise the TypeScript version the
declarations need, and the Node version the CommonJS build needs, and says so under **Changed**
and in its "Upgrading" notes. The ES module, CommonJS and UMD builds (UMD global
`BabylonQuarks`) all ship in every 1.x.

## Effect files

Files are versioned by `metadata.quarksFormat`, described in [docs/FORMAT.md](docs/FORMAT.md).

- **Every file an earlier release wrote keeps loading**, and means what it meant when it was
  written. A file of any older format goes through the upgrade steps in `formatMigrations.ts` as
  it is read, so a file saved by 0.27, three.quarks or any Unity exporter loads in every 1.x.
  Dropping a format a 1.x release could read takes a major.
- **A minor may raise the format** when it writes something an older reader would read wrongly.
  It adds the upgrade step, keeps the previous schema at its URL, and says so in the changelog.
- **Files from a newer release are read on a best-effort basis.** An older 1.x loads them with a
  warning, leaves out the settings it does not know, and may read some settings with their older
  meaning, so the effect can look different. Hand a file to a runtime at least as new as the one
  that saved it.
- Settings with their default value are not written. Adding a setting does not change existing
  files.

### The schema

Each format version has a JSON Schema at its own URL,
`https://soullnik.github.io/babylon.quarks-standalone/schema/effect-<version>.schema.json`, which
does not change once published. Name that URL in a file's `$schema`. The copy in the package,
`babylon.quarks/schema/effect.schema.json`, always describes the format its release writes, so it
moves to the new version when a minor raises the format.

## The look of an effect

An effect file, or an effect built in code, looks and moves the same in every 1.x: the same
shapes, curves, blending, colours and timing.

- **A change that would change how an existing effect looks waits for a major**, or comes behind
  a new setting whose default keeps the old look. (0.29 changed the look of effects through new
  defaults, `applyImageProcessing` and `scalingMode`; 1.x will not do that.)
- **A fix may change the look** when the old look was plainly wrong: it contradicted the TSDoc,
  the documented Unity behaviour the setting names, or what the editor showed. The changelog lists
  it under **Fixed** and says what changes on screen.
- **Not pixel-exact:** results differ slightly between GPUs, drivers, WebGL and WebGPU, and
  between Babylon.js releases.
- **Seeded randomness** (`ParticleSystem.seed`) plays the same within a minor, patches included.
  A minor may draw random values in a different order, which plays a seeded effect differently
  with the same distribution, and says so in its changelog. Replays and lock-step peers should run
  the same minor.

## Platforms

- **Babylon.js:** `@babylonjs/core` is a peer dependency. Each 1.x release supports Babylon.js 9
  from the lowest version its peer range admits, and CI tests that version and the latest.
  - A minor may raise that floor within 9.x when it needs something newer. It lists the raise
    under **Breaking** and in its "Upgrading" notes, and the editor's `@babylonjs/materials`
    floor moves with it.
  - A new Babylon.js 9.x that breaks quarks is fixed in a patch.
  - Supporting a new Babylon.js major is a minor when the old one keeps working; dropping one is
    a major.
- **Browsers:** WebGL2 in current Chrome, Edge and Firefox and in Safari 15 or later, and WebGPU
  where the browser provides it. CI compiles every shader in Chromium, GLSL and WGSL, and WebGPU
  is checked on real hardware before each release. WebGL1 is not supported. Dropping a browser or
  a graphics API takes a major.
- **Node:** the CommonJS build needs a Node that can `require` ES modules (20.19 or 22.12 and
  later), because `@babylonjs/core` is ES modules only. ES module imports and bundlers work
  everywhere.
- **Bundle size:** each build has a size budget that CI enforces, raised only by a PR that says
  why.

## The editor

`babylon.quarks-editor` keeps its own 0.x line. Its API and UI may change in any minor, as semver
allows before 1.0, and each release says what changed in its changelog.

Its peer dependency is the library's minor line, `~1.Y.0` (`~1.1.0` for babylon.quarks 1.1), since
it uses the newest API. **A project that embeds the editor upgrades it together with
babylon.quarks**: each library minor comes with an editor release, and a change to the editor's
peer range alone is a new editor patch. Files the editor saves are effect files, and the promises
above apply to them.

## The Unity exporter

The exporter in `tools/unity-quarks-exporter` takes the library's version. It writes the format
its version of the library reads, so export with the exporter of the same minor as the runtime the
files go to, or an older one.

## Reporting a break

If something that compiled, loaded or looked right in an earlier 1.x stops doing so, open an
issue with the two versions and a small effect or snippet that shows it. A break this page does
not allow is a bug, and is fixed in a patch.
