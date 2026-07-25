import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {PiecewiseBezier, Vector3Function} from '../functions';
import {Quaternion} from '../math';

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

/** Constructors the generated code needs to test a generator's or a particle's kind. */
const DEPS = {PiecewiseBezier, Vector3Function, Quaternion};

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
        case 'ForceOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const gx${k} = b${k}.x, gy${k} = b${k}.y, gz${k} = b${k}.z;
                    const tmp${k} = b${k}._temp, scale${k} = b${k}._tempScale, quat${k} = b${k}._tempQ;
                    const local${k} = b${k}.ps !== undefined && !b${k}.ps.worldSpace;`,
                body: `{tmp${k}.set(
                        gx${k}.genValue(p.memory, t),
                        gy${k}.genValue(p.memory, t),
                        gz${k}.genValue(p.memory, t));
                    if (local${k}) { tmp${k}.multiply(scale${k}).applyQuaternion(quat${k}); }
                    p.velocity.addScaledVector(tmp${k}, delta);}`,
            };
        case 'LimitSpeedOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.speed;
                    const dampen${k} = b${k}.dampen * delta * 20;`,
                body: `{const v = p.velocity;
                    const speed = v.length();
                    const limit = g${k}.genValue(p.memory, t);
                    if (speed > limit) {
                        v.multiplyScalar(1 - ((speed - limit) / speed) * dampen${k});
                    }}`,
            };
        case 'GravityForce':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const cx${k} = b${k}.center.x, cy${k} = b${k}.center.y, cz${k} = b${k}.center.z;
                    const gm${k} = b${k}.magnitude * delta;`,
                body: `{const pos = p.position;
                    const dx = cx${k} - pos.x, dy = cy${k} - pos.y, dz = cz${k} - pos.z;
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 > 0) {
                        const s = gm${k} / (d2 * Math.sqrt(d2));
                        const v = p.velocity;
                        v.x += dx * s; v.y += dy * s; v.z += dz * s;
                    }}`,
            };
        case 'ColorBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.color;
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};`,
                body: `{const ts = (p.startSpeed - lo${k}) / span${k};
                    const c = p.color, sc = p.startColor;
                    g${k}.genColor(p.memory, c, ts);
                    c.x *= sc.x; c.y *= sc.y; c.z *= sc.z; c.w *= sc.w;}`,
            };
        case 'SizeBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.size;
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};
                    const vec3_${k} = g${k} instanceof deps.Vector3Function;`,
                body: `{const ts = (p.startSpeed - lo${k}) / span${k};
                    if (vec3_${k}) {
                        g${k}.genValue(p.memory, p.size, ts).multiply(p.startSize);
                    } else {
                        const v = g${k}.genValue(p.memory, ts);
                        const s = p.size, ss = p.startSize;
                        s.x = ss.x * v; s.y = ss.y * v; s.z = ss.z * v;
                    }}`,
            };
        case 'RotationBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.angularVelocity;
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};`,
                body: `if (typeof p.rotation === 'number') {
                        p.rotation += delta * g${k}.genValue(p.memory, (p.startSpeed - lo${k}) / span${k});
                    }`,
            };
        case 'OrbitOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.orbitSpeed;
                    const axis${k} = b${k}.axis, tmp${k} = b${k}.temp, rot${k} = b${k}.rotation;`,
                body: `{const pos = p.position;
                    tmp${k}.copy(pos).projectOnVector(axis${k});
                    rot${k}.setFromAxisAngle(axis${k}, g${k}.genValue(p.memory, t) * delta);
                    pos.sub(tmp${k});
                    pos.applyQuaternion(rot${k});
                    pos.add(tmp${k});}`,
            };
        case 'Rotation3DOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.angularVelocity;
                    const q${k} = b${k}.tempQuat;`,
                // Only particles whose rotation is a quaternion take part; a
                // sprite billboard rotating by an angle is left alone, exactly
                // as the behavior's own update does.
                body: `{const r = p.rotation;
                    if (r instanceof deps.Quaternion) {
                        g${k}.genValue(p.memory, q${k}, delta, t);
                        r.multiply(q${k});
                    }}`,
            };
        case 'VelocityOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const lx${k} = b${k}.linearX, ly${k} = b${k}.linearY, lz${k} = b${k}.linearZ;
                    const ox${k} = b${k}.orbitalX, oy${k} = b${k}.orbitalY, oz${k} = b${k}.orbitalZ;
                    const tmp${k} = b${k}._temp, rot${k} = b${k}._tempRot;
                    const ax${k} = b${k}._axisX, ay${k} = b${k}._axisY, az${k} = b${k}._axisZ;
                    const pivot${k} = b${k}._tempEmitterPos;
                    const world${k} = b${k}.ps !== undefined && b${k}.ps.worldSpace;
                    const toWorld${k} = world${k} && b${k}.space === 'local';
                    const convert${k} = toWorld${k} || (!world${k} && b${k}.space === 'world');
                    const scale${k} = toWorld${k} ? b${k}._tempScale : b${k}._tempScaleInv;
                    const quat${k} = toWorld${k} ? b${k}._tempQ : b${k}._tempQInv;`,
                body: `{const pos = p.position;
                    tmp${k}.set(
                        lx${k}.genValue(p.memory, t),
                        ly${k}.genValue(p.memory, t),
                        lz${k}.genValue(p.memory, t));
                    if (convert${k}) { tmp${k}.multiply(scale${k}).applyQuaternion(quat${k}); }
                    pos.addScaledVector(tmp${k}, delta);
                    const rx = ox${k}.genValue(p.memory, t) * delta;
                    const ry = oy${k}.genValue(p.memory, t) * delta;
                    const rz = oz${k}.genValue(p.memory, t) * delta;
                    if (rx !== 0 || ry !== 0 || rz !== 0) {
                        if (world${k}) { pos.sub(pivot${k}); }
                        if (rx !== 0) { rot${k}.setFromAxisAngle(ax${k}, rx); pos.applyQuaternion(rot${k}); }
                        if (ry !== 0) { rot${k}.setFromAxisAngle(ay${k}, ry); pos.applyQuaternion(rot${k}); }
                        if (rz !== 0) { rot${k}.setFromAxisAngle(az${k}, rz); pos.applyQuaternion(rot${k}); }
                        if (world${k}) { pos.add(pivot${k}); }
                    }}`,
            };
        case 'InheritVelocity':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const ps${k} = b${k}.ps;
                    const velocity${k} = b${k}.mode === 'current' && ps${k} !== undefined
                        ? ps${k}.emitterVelocity : undefined;
                    const tmp${k} = b${k}._temp;
                    const local${k} = velocity${k} !== undefined && !ps${k}.worldSpace;
                    const scale${k} = b${k}._tempScaleInv, quat${k} = b${k}._tempQInv;
                    const gm${k} = b${k}.multiplier;`,
                body: `if (velocity${k} !== undefined) {
                        tmp${k}.copy(velocity${k});
                        if (local${k}) { tmp${k}.multiply(scale${k}).applyQuaternion(quat${k}); }
                        p.position.addScaledVector(tmp${k}, gm${k}.genValue(p.memory, t) * delta);
                    }`,
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
