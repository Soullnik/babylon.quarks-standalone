/**
 * Per-particle scratch storage that lets stochastic generators "remember" a
 * random sample they rolled at spawn time, so subsequent frames produce the
 * same value for the same particle.
 *
 * Each `Particle` owns one `GeneratorMemory` (see `Particle.memory`) that
 * starts empty and is cleared on `Particle.reset()` when the particle is
 * recycled. A particle's memory is independent from every other particle's.
 *
 * ## Lifecycle (per spawn)
 *
 * For every generator the particle system uses (startColor, startSpeed,
 * startLife, startSize, startRotation, etc.), the spawn path calls — in a
 * fixed, deterministic order:
 *
 * 1. `generator.startGen(particle.memory)` — gives the generator a chance to
 *    allocate a slot. A generator that needs a per-particle random sample
 *    captures the current length as its slot index, pushes the rolled value,
 *    and stores the index on itself (typically `this.indexCount`).
 * 2. `generator.genValue(particle.memory, …)` — reads back `memory[indexCount]`
 *    to produce the per-frame value. Called once per frame for the particle's
 *    lifetime.
 *
 * Concrete patterns implemented across the codebase:
 *
 * - **Stateless / deterministic** (`ConstantValue`, `PiecewiseBezier`,
 *   `Gradient`, `RandomColor`) — `startGen` is a no-op; `genValue` derives
 *   output from inputs (`t`, params) alone.
 * - **Sample-once stochastic** (`IntervalValue`, `ColorRange`,
 *   `RandomColorBetweenGradient`, `RandomQuatGenerator`) — `startGen` pushes
 *   one random sample into memory; `genValue` reads it. This is what keeps a
 *   given particle's "random" startSize/color/rotation fixed for its life.
 * - **Composite** (`AxisAngleGenerator`, `Vector3Function`, `EulerGenerator`)
 *   — `startGen` forwards to children so each child claims its own slot.
 *
 * ## Invariants
 *
 * - Every spawn must call `startGen` for the same set of generators in the
 *   same order. The slot index a generator captures during one particle's
 *   spawn must match what it reads for *that* particle on later frames.
 * - `indexCount` lives on the generator (shared across particles), not on
 *   memory. It is overwritten on every spawn; that is safe because each
 *   `genValue` call during a spawn happens before the next spawn's `startGen`.
 * - The values stored in memory are not aliased — each particle's memory is
 *   its own array, so two particles can hold different samples at the same
 *   slot without interference.
 */
export type GeneratorMemory = any[];
