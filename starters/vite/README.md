# babylon.quarks starter

A Babylon.js scene with one babylon.quarks effect, a flame, ready to edit.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Soullnik/babylon.quarks-standalone/tree/main/starters/vite?file=src%2Fmain.ts)

Or locally:

```bash
npm install
npm run dev
```

Everything is in `src/main.ts`: the scene, a `BatchedRenderer`, and a `ParticleSystem` with a cone
emitter, a Color over Lifetime and a Size over Lifetime behavior.

From here:

- Build effects visually in the [editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html),
  export them as JSON and load them with `QuarksLoader`.
- Browse the [examples](https://soullnik.github.io/babylon.quarks-standalone/) and their source in
  `examples/src/demos`.
- Read the [API documentation](https://soullnik.github.io/babylon.quarks-standalone/docs/).

The starter installs `babylon.quarks@next` while 1.0 is a release candidate.
