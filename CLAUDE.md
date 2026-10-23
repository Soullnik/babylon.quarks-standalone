# babylon.quarks: working rules

`babylon.quarks` is a public, open-source library on npm. People we will never meet build their
effects on it. Every change is made for them, not for the project that asked for it.

## The library leads, consumers follow

- **Never shape quarks around one consumer.** When a game or app needs something quarks lacks,
  find the general capability behind the need and build that. Do not build the narrow switch that
  makes one effect look right.
- **The consumer adapts to the API.** If an effect needs a texture re-authored, a JSON effect
  re-exported, a mesh given a second UV set, or its own code rewritten, the change goes there.
  Quarks gets no special case, no option named after one asset, and no workaround for how one
  picture happens to be drawn.
- **Design from the reference engines.** Before adding an option, check how Unity (Shuriken,
  Shader Graph, VFX Graph) and Unreal (Niagara, Cascade) offer the same capability. Match their
  concepts and vocabulary where they fit, for example UV channels, Tiling/Offset, Panner, Fresnel,
  SubUV, Scaling Mode and channel-packed masks. If neither engine has something like it, treat
  that as a warning sign and justify the option in the PR.
- **General over specific.** Prefer one composable concept, such as a per-texture UV transform,
  over several single-purpose fields, such as one scale for this mask and one scroll for that
  noise. If a field only makes sense for the effect that prompted it, it does not belong here.

## Every feature or fix is production work

A change is done only when all of the following hold:

1. **API.**
   - Typed, documented with TSDoc, and consistent with the existing settings.
   - Inputs are normalised and defaulted. Unset means off and costs nothing.
   - Batching keys include every setting that changes the material.
   - JSON writes only non-default values and round-trips through `toJSON`, `fromJSON`, `clone()`
     and `QuarksLoader`.
2. **Every path.**
   - It works in every render mode it can apply to: billboard, stretched, mesh, trail and beam.
   - It works in both shader languages, GLSL and WGSL.
   - Render modes it cannot apply to are documented as such.
3. **Tests.**
   - Jest tests cover behaviour, defaults, batching, serialisation and the shader sources.
   - Coverage thresholds in `jest.config.json` must hold.
   - `npm run validate:shaders` compiles every variant of `shaderVariants()` in GLSL and WGSL, and
     passes; a new define reaches it through `shaderProgram` and the axes in `shaderVariants.ts`.
4. **Review.**
   - An independent review looks for correctness, edge cases, leaks and API design before merge.
   - Review findings are fixed or answered.
5. **Docs.**
   - A `packages/babylon.quarks/CHANGELOG.md` entry under the upcoming version.
   - A demo in `examples/` when the feature is visual.
   - Breaking changes are called out in the changelog.

Run `npm run check` from the repo root before opening a PR.

## Workflow notes

- Read `CONTRIBUTING.md` for layout, commands, commit style and releases.
- When a consumer's request lands here, first write down the general capability and the
  Unity/Unreal equivalent, then design the API, then implement. If the request only makes sense
  for that consumer, solve it in the consumer.
- The maintainer publishes to npm. Prepare the version bump and changelog, then stop there.
