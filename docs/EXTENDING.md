# Extending babylon.quarks

Effects are built from emitter shapes, behaviors and value generators. You can add your own
shapes and behaviors without forking the library. A plugin registers them by name, so effect
files can store them and `QuarksLoader` can read them back. This is the same role a custom module
plays in Unreal's Niagara, or a custom Shuriken module script plays in Unity.

This page is the contract for that code. `packages/babylon.quarks/test/extending.test.ts` runs
every example on it.

## A behavior

A behavior changes particles while they live. Implement `Behavior`:

```ts
import type {Behavior, BehaviorJSON, IParticleSystem, Particle} from 'babylon.quarks';

/** Slows particles down in proportion to their speed: Unity's Limit Velocity "Drag". */
export class Drag implements Behavior {
    type = 'Drag';

    constructor(public drag = 1) {}

    initialize(particle: Particle, system: IParticleSystem): void {}

    update(particle: Particle, delta: number): void {
        particle.velocity.multiplyScalar(Math.max(0, 1 - this.drag * delta));
    }

    frameUpdate(delta: number): void {}

    toJSON(): BehaviorJSON & {drag: number} {
        return {type: 'Drag', drag: this.drag};
    }

    clone(): Behavior {
        return new Drag(this.drag);
    }

    reset(): void {}
}
```

The hooks:

- **`initialize(particle, system)`** runs once, when a particle is born. It runs after the start
  values and the shape have placed the particle.
- Then, every simulation step, the behaviors run in their order. For each behavior:
  - **`frameUpdate(delta)`** runs first, once. Use it to refresh values every particle reads. It
    runs after the behaviors before it have updated their particles.
  - **`update(particle, delta)`** then runs for each live particle. `delta` is in seconds of the
    system's own time.
  - **`updateAll(particles, count, delta)`** is optional. If you define it, the system calls it
    once instead of calling `update` for each particle. It covers `particles[0..count)`, it must
    skip dead particles in that range (`age >= life`), and it must give the same result as
    `update`. If a subclass overrides `update` but not `updateAll`, its `update` is called.
- After every behavior has run, the system ages the particles and moves them by their velocity.
  So a behavior that changes `velocity` moves the particle in the same step.
- **`reset()`** runs when the system restarts.
- **`clone()`** must return an independent copy, so that one effect can be pooled and instanced.

### What a behavior sees

`particle.position`, `velocity`, `size` and `color` (and the `start*` values) are the
simulation's own vectors. Edit them in place: `x`, `y`, `z`, `w` on vectors; `r`, `g`, `b`, `a`
or `x`, `y`, `z`, `w` on colours; and their methods, such as `multiplyScalar`, `add` and `set`.
Don't keep references to them past the call, because the system reuses particles.

These classes are not exported. Type the parameters as `Particle` and let TypeScript infer the
rest, or read and write fields through the `Vector3Like` and `Color4Like` shapes. Values your
behavior takes from users, such as an axis or a colour, should be typed `Vector3Like` or
`Color4Like` and copied, the same way the built-in behaviors do it.

`position` and `velocity` are in the system's simulation space. That is the emitter's local space
for a local-space system, and the world for a `worldSpace` system. To work in another space, take
the emitter's frame from `system.emitter.matrixWorld`. Keep `system` from `initialize`, and
read the matrix in `frameUpdate`, because the emitter can move.

### Performance and the compiled pass

The renderer compiles runs of built-in behaviors into one loop over the particle columns. A custom
behavior is never compiled. It runs its own `update` or `updateAll`, in its place in the order,
and the built-ins before and after it are compiled separately. A behavior counts as a built-in by
its implementation, not by its `type` string. Only an instance of exactly a built-in class, with
no method set on the instance, is compiled:

- A behavior whose `type` copies a built-in's name (for example `'ColorOverLife'`) is still
  custom. It runs its own code.
- Any subclass of a built-in is custom and runs its own methods, including those it inherits.
  The compiled code inlines the built-in's helpers as well as its `update`, so it could skip an
  override.
- The choice is made when the system first runs a behavior. Set any method on the instance
  before that. To change one later, replace the behavior with a new instance.

The renderer treats a custom behavior as able to change any particle value, including size and
colour. So it copies those values for the renderer every step while the behavior is on the system.
That is correct but costs a little. Prefer `updateAll` for behaviors that run on many particles.

## An emitter shape

A shape places each new particle and gives it a start direction. Implement `EmitterShape`:

```ts
import type {EmitterShape, IParticleSystem, Particle, ShapeJSON} from 'babylon.quarks';
import {random} from 'babylon.quarks';

/** Emits along a line from `-length / 2` to `length / 2` on x, heading up: Niagara's Line shape. */
export class LineEmitter implements EmitterShape {
    type = 'line';

    constructor(public length = 1) {}

    initialize(particle: Particle): void {
        particle.position.set((random() - 0.5) * this.length, 0, 0);
        particle.velocity.set(0, particle.startSpeed, 0);
    }

    update(system: IParticleSystem, delta: number): void {}

    toJSON(): ShapeJSON {
        return {type: 'line', length: this.length};
    }

    clone(): EmitterShape {
        return new LineEmitter(this.length);
    }
}
```

- `initialize` must set both `position` and `velocity`. The velocity's length is the start speed:
  scale your direction by `particle.startSpeed`.
- Use quarks' `random()` instead of `Math.random()`. That way `withRandomSource` and seeded
  playback reproduce your shape.
- The optional `reset()` runs when the system restarts, for a shape that keeps state across
  particles (one that walks a path, for example).
- An optional `transform` (a `ShapeTransform`) moves, rotates and scales the shape, like the
  Shape module's Position, Rotation and Scale. Call `this.transform?.apply(particle)` at the end of
  `initialize` if you support it, and write it with `ShapeTransform.toShapeJSON`.

## Saving and loading: plugins

Register your types once, before you load or build effects that use them:

```ts
import {loadPlugin} from 'babylon.quarks';

loadPlugin({
    id: 'my-effects',
    initialize: () => {},
    behaviors: [
        {
            type: 'Drag',
            constructor: Drag,
            params: [['drag', ['number']]],
            loadJSON: (json) => new Drag((json as {drag?: number}).drag ?? 1),
        },
    ],
    emitterShapes: [
        {
            type: 'line',
            constructor: LineEmitter,
            params: [['length', ['number']]],
            loadJSON: (json) => new LineEmitter((json as {length?: number}).length ?? 1),
        },
    ],
});
```

- `type` must be unique. A name that is already registered, whether built-in or from an earlier
  plugin, is kept, and yours is ignored. Prefix your names (`'my.Drag'`) if they might clash.
- Loading a plugin whose `id` is already loaded does nothing. `unloadPlugin(id)` removes the types
  the plugin registered.
- `toJSON` writes every field. When an effect is saved, fields equal to their defaults are
  dropped. To find the defaults, `loadJSON` is called with `{type}` alone, then again with the
  smaller JSON to check that it reads back the same. So `loadJSON` must give every missing field
  its default, and must not have side effects.
- `params` lists the fields an editor can show, and the kinds of value each takes.
- Without the plugin, a file that names your type still loads. The behavior is skipped, or the
  shape becomes a point, with a warning.

## Value generators

Behaviors and shapes take numbers, curves and colours as generators: `ConstantValue`,
`IntervalValue`, `PiecewiseBezier`, `ConstantColor`, `Gradient` and the rest. Take a generator
instead of a plain number wherever an artist would want a curve or a random range. Read it with
`genValue(particle.memory, t)`, where `t` is the particle's age over its life. Call `startGen`
from `initialize` so random ranges pick their sample once per particle.
