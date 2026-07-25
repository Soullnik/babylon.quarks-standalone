import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {PiecewiseBezier, Vector3Function} from '../functions';

/**
 * Compiles a run of behaviors into a single loop over the particles.
 *
 * Each behavior walking the particle array on its own means the array, and
 * every particle in it, is re-read once per behavior. Merging the ones this
 * module recognises into one pass reads each particle once — worth roughly
 * 1.2x at a hundred thousand particles and up to 1.6x at twenty thousand,
 * where the per-pass overhead weighs most.
 *
 * A behavior that is not recognised keeps its own pass, in its original place
 * in the order, so nothing here depends on the built-in set being complete.
 */

/** Runs the compiled work for `particles[0..count)`. */
export type FusedPass = (behaviors: Array<Behavior>, particles: Array<Particle>, count: number, delta: number) => void;

/** One step of a plan: either a compiled run of behaviors, or a single behavior. */
export interface FusionStep {
    /** Behaviors this step covers, in order. */
    behaviors: Array<Behavior>;
    /** Compiled pass, or undefined when the behavior runs its own update. */
    run?: FusedPass;
}

/** Constructors the generated code needs to test a generator's kind. */
const DEPS = {PiecewiseBezier, Vector3Function};

interface Fragment {
    /** Hoisted out of the loop; runs once per pass. */
    setup: string;
    /** Body applied to particle `p`, with `t` already computed. */
    body: string;
}

/**
 * Source for one behavior, or null when it is not one this module knows.
 *
 * Everything is read out of `behaviors[k]` at pass time rather than captured,
 * so swapping a behavior's generator takes effect on the next frame without
 * recompiling.
 */
function fragmentFor(behavior: Behavior, k: number): Fragment | null {
    switch (behavior.type) {
        case 'ColorOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].color;`,
                body: `{const c = p.color, sc = p.startColor;
                    g${k}.genColor(p.memory, c, t);
                    c.x *= sc.x; c.y *= sc.y; c.z *= sc.z; c.w *= sc.w;}`,
            };
        case 'SizeOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].size;
                    const vec3_${k} = g${k} instanceof deps.Vector3Function;`,
                body: `if (vec3_${k}) {
                        g${k}.genValue(p.memory, p.size, t).multiply(p.startSize);
                    } else {
                        const v = g${k}.genValue(p.memory, t);
                        const s = p.size, ss = p.startSize;
                        s.x = ss.x * v; s.y = ss.y * v; s.z = ss.z * v;
                    }`,
            };
        case 'ApplyForce':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const f${k} = b${k}.magnitudeValue * delta;
                    const dx${k} = b${k}.direction.x * f${k};
                    const dy${k} = b${k}.direction.y * f${k};
                    const dz${k} = b${k}.direction.z * f${k};`,
                body: `{const v = p.velocity; v.x += dx${k}; v.y += dy${k}; v.z += dz${k};}`,
            };
        case 'RotationOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].angularVelocity;`,
                body: `if (typeof p.rotation === 'number') {
                        p.rotation += delta * g${k}.genValue(p.memory, t);
                    }`,
            };
        case 'FrameOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].frame;
                    const bezier_${k} = g${k} instanceof deps.PiecewiseBezier;`,
                body: `if (bezier_${k}) { p.uvTile = g${k}.genValue(p.memory, t); }`,
            };
        case 'SpeedOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].speed;`,
                body: `p.speedModifier = g${k}.genValue(p.memory, t);`,
            };
        default:
            return null;
    }
}

/**
 * Compiled passes shared by every system whose behaviors line up the same way.
 *
 * The generated code depends only on the behavior types and their positions, so
 * a scene full of copies of one effect compiles once rather than once per
 * system. `null` records a shape that could not be compiled, so an environment
 * without code generation does not retry on every system.
 */
const passCache = new Map<string, FusedPass | null>();

/**
 * Compiles the fragments of a run into one pass, reusing an earlier compile of
 * the same shape. Returns undefined when the environment forbids code
 * generation.
 */
function compile(fragments: Array<Fragment>, key: string): FusedPass | undefined {
    const cached = passCache.get(key);
    if (cached !== undefined) {
        return cached ?? undefined;
    }
    const compiled = generate(fragments);
    passCache.set(key, compiled ?? null);
    return compiled;
}

function generate(fragments: Array<Fragment>): FusedPass | undefined {
    const source = `
        ${fragments.map((f) => f.setup).join('\n')}
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            if (p.age >= p.life) continue;
            const t = p.age / p.life;
            ${fragments.map((f) => f.body).join('\n')}
        }`;
    try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const factory = new Function('deps', `return function (behaviors, particles, count, delta) {${source}};`);
        return factory(DEPS) as FusedPass;
    } catch (error) {
        // A page served under a Content-Security-Policy without 'unsafe-eval'
        // cannot build functions at runtime. Behaviors then keep their own
        // passes, which is only slower, never wrong.
        return undefined;
    }
}

/**
 * Splits `behaviors` into steps, merging consecutive recognised ones.
 *
 * Only consecutive behaviors are merged: a behavior that stays on its own must
 * still see the particles exactly where the original order left them.
 */
export function planBehaviorFusion(behaviors: Array<Behavior>): Array<FusionStep> {
    const steps: Array<FusionStep> = [];
    let runBehaviors: Array<Behavior> = [];
    let runFragments: Array<Fragment> = [];
    let runStart = 0;

    const flush = () => {
        if (runFragments.length === 0) {
            return;
        }
        // A single behavior gains nothing from being wrapped in generated code.
        const key = `${runStart}:${runBehaviors.map((b) => b.type).join(',')}`;
        const run = runFragments.length > 1 ? compile(runFragments, key) : undefined;
        if (run !== undefined) {
            steps.push({behaviors: runBehaviors, run});
        } else {
            for (const behavior of runBehaviors) {
                steps.push({behaviors: [behavior]});
            }
        }
        runBehaviors = [];
        runFragments = [];
    };

    for (let i = 0; i < behaviors.length; i++) {
        const behavior = behaviors[i];
        const fragment = fragmentFor(behavior, i);
        if (fragment === null) {
            flush();
            steps.push({behaviors: [behavior]});
            continue;
        }
        if (runFragments.length === 0) {
            runStart = i;
        }
        runBehaviors.push(behavior);
        runFragments.push(fragment);
    }
    flush();
    return steps;
}
