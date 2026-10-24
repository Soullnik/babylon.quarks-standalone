import {
    AxisAngleGenerator,
    ColorRange,
    ConstantValue,
    Gradient,
    IntervalValue,
    PiecewiseBezier,
    Vector3Function,
} from '../functions';
import {Quaternion, Vector4View} from '../math';
import {Particle} from '../Particle';
import {ParticleStore} from '../ParticleStore';
import {Behavior} from './Behavior';

/**
 * Compiles a run of behaviors into a single loop over the particles.
 *
 * Each behavior walking the particle array on its own means the array, and
 * every particle in it, is re-read once per behavior. Merging the ones this
 * module recognises into one pass reads each particle once.
 *
 * The compiled pass works on the {@link ParticleStore} columns directly. Going
 * through the particle objects instead — `particles[i].color.x` — means three
 * dependent loads through objects scattered over the heap for every number
 * touched (the particle, its `Vector4View`, the view's array), and at tens of
 * thousands of particles that pointer chasing, not the arithmetic, is what the
 * step spends its time on: measured at roughly ten times the cost of reading
 * the same numbers out of the columns. The particle object is only reached for
 * when a generator needs the particle's own memory (a per-particle random
 * sample) or holds an object-valued attribute (a quaternion rotation).
 *
 * The pass relies on the system's invariant that `particles[i]` owns row `i`
 * of the store, which the system keeps when it compacts the dead.
 *
 * A behavior that is not recognised keeps its own pass, in its original place
 * in the order, so nothing here depends on the built-in set being complete.
 */

/**
 * Runs the compiled work for `particles[0..count)`. `store` is the column
 * storage behind the particles; when omitted it is taken from the first
 * particle.
 */
export type FusedPass = (
    behaviors: Array<Behavior>,
    particles: Array<Particle>,
    count: number,
    delta: number,
    store?: ParticleStore
) => void;

/** One step of a plan: either a compiled run of behaviors, or a single behavior. */
export interface FusionStep {
    /** Behaviors this step covers, in order. */
    behaviors: Array<Behavior>;
    /** Compiled pass, or undefined when the behavior runs its own update. */
    run?: FusedPass;
}

/** Constructors and helpers the generated code needs. */
const DEPS = {
    PiecewiseBezier,
    Vector3Function,
    Quaternion,
    ConstantValue,
    Gradient,
    Vector4View,
    AxisAngleGenerator,
    IntervalValue,
    ColorRange,
};

interface Fragment {
    /** Hoisted out of the loop; runs once per pass. */
    setup: string;
    /**
     * Body applied to row `i`, with `t` (age over life), `o3` / `o4` (row
     * offsets into the three- and four-component columns), `s` (offset into
     * the scalars) and `p` (the particle object) already bound.
     */
    body: string;
}

/**
 * Setup for a scalar generator read from `expr`, bound to names prefixed `n`.
 *
 * The generator's kind is decided once per pass: a sampled {@link PiecewiseBezier}
 * is interpolated inline, a {@link ConstantValue} is read once, anything else is
 * called. The table is only used when the owning behavior has refreshed it,
 * exactly as the behavior's own update would.
 */
function scalarSetup(n: string, expr: string): string {
    return `const ${n} = ${expr};
        const ${n}_tbl = ${n} instanceof deps.PiecewiseBezier ? ${n}.sampledTable() : null;
        const ${n}_last = ${n}_tbl !== null ? ${n}_tbl.length - 1 : 0;
        const ${n}_const = ${n} instanceof deps.ConstantValue;
        const ${n}_cv = ${n}_const ? ${n}.value : 0;
        const ${n}_iv = ${n} instanceof deps.IntervalValue;
        const ${n}_slot = ${n}_iv ? ${n}.indexCount : -1;
        const ${n}_col = ${n}_slot >= 0 && ${n}_slot < ms;
        const ${n}_a = ${n}_iv ? ${n}.a : 0, ${n}_b = ${n}_iv ? ${n}.b : 0;`;
}

/** Statements declaring `ts`, the row's current speed within behavior `k`'s range; see speedFraction. */
function speedFractionOf(k: number): string {
    return `const vx = vel[o3], vy = vel[o3 + 1], vz = vel[o3 + 2];
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) * scalars[s + 2];
        let ts = span${k} === 0 ? (speed >= lo${k} ? 1 : 0) : (speed - lo${k}) / span${k};
        ts = ts < 0 ? 0 : ts > 1 ? 1 : ts;`;
}

/** Statements that declare `out` and set it to the generator's value at `t`. */
function scalarValue(n: string, out: string, t: string): string {
    return `let ${out};
        if (${n}_tbl !== null) {
            const tt = ${t};
            if (tt <= 0) ${out} = ${n}_tbl[0];
            else if (tt >= 1) ${out} = ${n}_tbl[${n}_last];
            else {
                const x = tt * ${n}_last;
                const ix = x | 0;
                const v0 = ${n}_tbl[ix];
                ${out} = v0 + (${n}_tbl[ix + 1] - v0) * (x - ix);
            }
        } else if (${n}_const) ${out} = ${n}_cv;
        else if (${n}_iv) {
            // The particle's own sample, from the memory column when it holds it.
            let r = ${n}_col ? mem[row * ms + ${n}_slot] : NaN;
            if (r !== r) r = p.memory[${n}_slot];
            ${out} = (1 - r) * ${n}_a + r * ${n}_b;
        } else ${out} = ${n}.genValue(p.memory, ${t});`;
}

/** Setup for a colour generator read from `expr`, bound to names prefixed `n`. */
function colorSetup(n: string, expr: string): string {
    return `const ${n} = ${expr};
        const ${n}_tbl = ${n} instanceof deps.Gradient ? ${n}.sampledTable() : null;
        const ${n}_last = ${n}_tbl !== null ? ${n}_tbl.length / 4 - 1 : 0;
        const ${n}_cr = ${n} instanceof deps.ColorRange;
        const ${n}_slot = ${n}_cr ? ${n}.indexCount : -1;
        const ${n}_col = ${n}_slot >= 0 && ${n}_slot < ms;
        // Rounded to float32 as copying the colour into the particle does.
        const ${n}_ax = ${n}_cr ? Math.fround(${n}.a.x) : 0, ${n}_ay = ${n}_cr ? Math.fround(${n}.a.y) : 0;
        const ${n}_az = ${n}_cr ? Math.fround(${n}.a.z) : 0, ${n}_aw = ${n}_cr ? Math.fround(${n}.a.w) : 0;
        const ${n}_bx = ${n}_cr ? ${n}.b.x : 0, ${n}_by = ${n}_cr ? ${n}.b.y : 0;
        const ${n}_bz = ${n}_cr ? ${n}.b.z : 0, ${n}_bw = ${n}_cr ? ${n}.b.w : 0;`;
}

/**
 * Statements writing the generator's colour at `t`, times the start colour,
 * into row `o4` of the colour column. Each channel is rounded to float32
 * before the multiply, as it is when the generator writes into the particle's
 * colour view first, so both paths produce the same bits.
 */
function colorWrite(n: string, t: string): string {
    return `if (${n}_tbl !== null) {
            const tt = ${t};
            const tbl = ${n}_tbl;
            let r, g, b, a;
            if (tt <= 0) {
                r = tbl[0]; g = tbl[1]; b = tbl[2]; a = tbl[3];
            } else if (tt >= 1) {
                const o = ${n}_last * 4;
                r = tbl[o]; g = tbl[o + 1]; b = tbl[o + 2]; a = tbl[o + 3];
            } else {
                const x = tt * ${n}_last;
                const ix = x | 0;
                const fr = x - ix;
                const o = ix * 4;
                const nx = o + 4;
                r = tbl[o] + (tbl[nx] - tbl[o]) * fr;
                g = tbl[o + 1] + (tbl[nx + 1] - tbl[o + 1]) * fr;
                b = tbl[o + 2] + (tbl[nx + 2] - tbl[o + 2]) * fr;
                a = tbl[o + 3] + (tbl[nx + 3] - tbl[o + 3]) * fr;
            }
            color[o4] = Math.fround(r) * startColor[o4];
            color[o4 + 1] = Math.fround(g) * startColor[o4 + 1];
            color[o4 + 2] = Math.fround(b) * startColor[o4 + 2];
            color[o4 + 3] = Math.fround(a) * startColor[o4 + 3];
        } else if (${n}_cr) {
            let r = ${n}_col ? mem[row * ms + ${n}_slot] : NaN;
            if (r !== r) r = p.memory[${n}_slot];
            color[o4] = Math.fround(${n}_ax + (${n}_bx - ${n}_ax) * r) * startColor[o4];
            color[o4 + 1] = Math.fround(${n}_ay + (${n}_by - ${n}_ay) * r) * startColor[o4 + 1];
            color[o4 + 2] = Math.fround(${n}_az + (${n}_bz - ${n}_az) * r) * startColor[o4 + 2];
            color[o4 + 3] = Math.fround(${n}_aw + (${n}_bw - ${n}_aw) * r) * startColor[o4 + 3];
        } else {
            ${n}.genColor(p.memory, tmpColor, ${t});
            color[o4] = tmpColor.x * startColor[o4];
            color[o4 + 1] = tmpColor.y * startColor[o4 + 1];
            color[o4 + 2] = tmpColor.z * startColor[o4 + 2];
            color[o4 + 3] = tmpColor.w * startColor[o4 + 3];
        }`;
}

/** Statements turning the quaternion components into a rotation applied to `(x, y, z)` in place. */
function rotateInPlace(x: string, y: string, z: string, qx: string, qy: string, qz: string, qw: string): string {
    return `{
            const cx = 2 * (${qy} * ${z} - ${qz} * ${y});
            const cy = 2 * (${qz} * ${x} - ${qx} * ${z});
            const cz = 2 * (${qx} * ${y} - ${qy} * ${x});
            const nx = ${x} + ${qw} * cx + ${qy} * cz - ${qz} * cy;
            const ny = ${y} + ${qw} * cy + ${qz} * cx - ${qx} * cz;
            ${z} = ${z} + ${qw} * cz + ${qx} * cy - ${qy} * cx;
            ${x} = nx;
            ${y} = ny;
        }`;
}

/** Setup reading a quaternion's components once, as `${n}x..${n}w`. */
function quaternionSetup(n: string, expr: string): string {
    return `const ${n}_q = ${expr};
        const ${n}x = ${n}_q.x, ${n}y = ${n}_q.y, ${n}z = ${n}_q.z, ${n}w = ${n}_q.w;`;
}

/** Setup reading a vector's components once, as `${n}x..${n}z`. */
function vectorSetup(n: string, expr: string): string {
    return `const ${n}_v = ${expr};
        const ${n}x = ${n}_v.x, ${n}y = ${n}_v.y, ${n}z = ${n}_v.z;`;
}

/**
 * Statements orbiting the float32-rounded point `(px, py, pz)` by `angle`
 * around the unit axis `(ax, ay, az)`, as `Quaternion.setFromAxisAngle`
 * followed by `Vector3.applyQuaternion` on a stored vector would.
 */
function orbitInPlace(angle: string, ax: string, ay: string, az: string): string {
    return `{
            const half = ${angle} / 2;
            const sn = Math.sin(half);
            const qx = ${ax} * sn, qy = ${ay} * sn, qz = ${az} * sn, qw = Math.cos(half);
            ${rotateInPlace('px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw')}
            px = Math.fround(px); py = Math.fround(py); pz = Math.fround(pz);
        }`;
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
                setup: colorSetup(`g${k}`, `behaviors[${k}].color`),
                body: `{${colorWrite(`g${k}`, 't')}}`,
            };
        case 'SizeOverLife':
            return {
                setup: `const g${k} = behaviors[${k}].size;
                    const vec3_${k} = g${k} instanceof deps.Vector3Function;
                    ${scalarSetup(`sg${k}`, `g${k}`)}`,
                body: `if (vec3_${k}) {
                        g${k}.genValue(p.memory, p.size, t).multiply(p.startSize);
                    } else {
                        ${scalarValue(`sg${k}`, 'v', 't')}
                        size[o3] = startSize[o3] * v;
                        size[o3 + 1] = startSize[o3 + 1] * v;
                        size[o3 + 2] = startSize[o3 + 2] * v;
                    }`,
            };
        case 'ApplyForce':
            return {
                // The direction is already in the simulation space (the behavior's
                // frameUpdate converts it), and the step carries the system's
                // motionScale. The magnitude is rolled per particle; a constant one
                // is read once.
                setup: `const b${k} = behaviors[${k}];
                    const d${k} = b${k}._direction;
                    const dx${k} = d${k}.x, dy${k} = d${k}.y, dz${k} = d${k}.z;
                    const step${k} = b${k}._step(delta);
                    ${scalarSetup(`g${k}`, `b${k}.magnitude`)}`,
                body: `{
                        ${scalarValue(`g${k}`, 'm', 't')}
                        const s = m * step${k};
                        vel[o3] += dx${k} * s; vel[o3 + 1] += dy${k} * s; vel[o3 + 2] += dz${k} * s;
                    }`,
            };
        case 'RotationOverLife':
            return {
                // Whether the particles rotate by an angle or by quaternion is a
                // property of the system (billboard or mesh; trails do neither),
                // so it is read off the first particle once rather than per particle.
                setup: `${scalarSetup(`g${k}`, `behaviors[${k}].angularVelocity`)}
                    const rotation_${k} = count > 0 ? particles[0].rotation : undefined;
                    const angle_${k} = typeof rotation_${k} === 'number';
                    const rq${k} = store.rotationQuaternion, aq${k} = store.angularVelocityQuaternion;
                    const quat_${k} = !angle_${k} && rq${k}.length > 0 && rotation_${k} instanceof deps.Quaternion;`,
                // The rate (or the step's turn) is kept for the renderer, which
                // draws between simulation steps. A mesh particle turns about its
                // own Z, as RotationOverLife.turnAboutZ does.
                body: `if (angle_${k}) {
                        ${scalarValue(`g${k}`, 'rate', 't')}
                        rot[row] += delta * rate;
                        angVel[row] = rate;
                    } else if (quat_${k}) {
                        ${scalarValue(`g${k}`, 'rate', 't')}
                        const half = (rate * delta) / 2;
                        const qz = Math.sin(half), qw = Math.cos(half);
                        const ax = rq${k}[o4], ay = rq${k}[o4 + 1], az = rq${k}[o4 + 2], aw = rq${k}[o4 + 3];
                        rq${k}[o4] = ax * qw + ay * qz;
                        rq${k}[o4 + 1] = ay * qw - ax * qz;
                        rq${k}[o4 + 2] = az * qw + aw * qz;
                        rq${k}[o4 + 3] = aw * qw - az * qz;
                        aq${k}[o4] = 0; aq${k}[o4 + 1] = 0; aq${k}[o4 + 2] = qz; aq${k}[o4 + 3] = qw;
                    }`,
            };
        case 'FrameOverLife':
            // Frame rate, cycles and start frame go through the behavior's own
            // frameAt; the plain life-fraction curve stays inline.
            return {
                setup: `${scalarSetup(`g${k}`, `behaviors[${k}].frame`)}
                    const b${k} = behaviors[${k}];
                    const plain${k} = typeof b${k}.isPlain !== 'function' || b${k}.isPlain();`,
                body: `if (plain${k}) {${scalarValue(`g${k}`, 'v', 't')} uvTile[row] = v;}
                    else uvTile[row] = b${k}.frameAt(p, age, t);`,
            };
        case 'SpeedOverLife':
            return {
                setup: scalarSetup(`g${k}`, `behaviors[${k}].speed`),
                body: `{${scalarValue(`g${k}`, 'v', 't')} scalars[s + 2] = v;}`,
            };
        case 'ForceOverLife':
            return {
                // The force is authored in b.space and converted into the simulation
                // space with the emitter frame b.frameUpdate decomposed, exactly as
                // EmitterFrame.toSimulation does; the step carries motionScale.
                setup: `const b${k} = behaviors[${k}];
                    ${scalarSetup(`gx${k}`, `b${k}.x`)}
                    ${scalarSetup(`gy${k}`, `b${k}.y`)}
                    ${scalarSetup(`gz${k}`, `b${k}.z`)}
                    const world${k} = b${k}.ps === undefined || b${k}.ps.worldSpace;
                    const toWorld${k} = world${k} && b${k}.space === 'local';
                    const toLocal${k} = !world${k} && b${k}.space === 'world';
                    const step${k} = b${k}._step(delta);
                    const fr${k} = b${k}._frame;
                    ${vectorSetup(`sc${k}`, `toWorld${k} ? fr${k}.scale : fr${k}.scaleInverse`)}
                    ${quaternionSetup(`q${k}`, `toWorld${k} ? fr${k}.quaternion : fr${k}.quaternionInverse`)}`,
                body: `{
                    ${scalarValue(`gx${k}`, 'fx', 't')}
                    ${scalarValue(`gy${k}`, 'fy', 't')}
                    ${scalarValue(`gz${k}`, 'fz', 't')}
                    if (toWorld${k}) {
                        fx *= sc${k}x; fy *= sc${k}y; fz *= sc${k}z;
                        ${rotateInPlace('fx', 'fy', 'fz', `q${k}x`, `q${k}y`, `q${k}z`, `q${k}w`)}
                    } else if (toLocal${k}) {
                        ${rotateInPlace('fx', 'fy', 'fz', `q${k}x`, `q${k}y`, `q${k}z`, `q${k}w`)}
                        fx *= sc${k}x; fy *= sc${k}y; fz *= sc${k}z;
                    }
                    vel[o3] += fx * step${k}; vel[o3 + 1] += fy * step${k}; vel[o3 + 2] += fz * step${k};}`,
            };
        case 'LimitSpeedOverLife':
            return {
                // Per-axis limits (a Vector3Function) go through the behavior's own update, which
                // writes the particle's velocity view of the same column.
                setup: `const b${k} = behaviors[${k}];
                    const vec3_${k} = b${k}.speed instanceof deps.Vector3Function;
                    ${scalarSetup(`g${k}`, `b${k}.speed`)}
                    const dampen${k} = b${k}.dampenStep(delta);
                    const ms${k} = typeof b${k}.motionScale === 'function' ? b${k}.motionScale() : 1;`,
                body: `if (vec3_${k}) b${k}.update(p, delta);
                    else {const vx = vel[o3], vy = vel[o3 + 1], vz = vel[o3 + 2];
                    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
                    ${scalarValue(`g${k}`, 'limitBase', 't')}
                    const limit = limitBase * ms${k};
                    if (speed > limit) {
                        const f = 1 - ((speed - limit) / speed) * dampen${k};
                        vel[o3] = vx * f; vel[o3 + 1] = vy * f; vel[o3 + 2] = vz * f;
                    }}`,
            };
        case 'GravityForce':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const cx${k} = b${k}.center.x, cy${k} = b${k}.center.y, cz${k} = b${k}.center.z;
                    const gm${k} = b${k}.magnitude * delta;`,
                body: `{const dx = cx${k} - pos[o3], dy = cy${k} - pos[o3 + 1], dz = cz${k} - pos[o3 + 2];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 > 0) {
                        const f = gm${k} / (d2 * Math.sqrt(d2));
                        vel[o3] += dx * f; vel[o3 + 1] += dy * f; vel[o3 + 2] += dz * f;
                    }}`,
            };
        case 'ColorBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    ${colorSetup(`g${k}`, `b${k}.color`)}
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};`,
                body: `{${speedFractionOf(k)}
                    ${colorWrite(`g${k}`, 'ts')}}`,
            };
        case 'SizeBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.size;
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};
                    const vec3_${k} = g${k} instanceof deps.Vector3Function;
                    ${scalarSetup(`sg${k}`, `g${k}`)}`,
                body: `{${speedFractionOf(k)}
                    if (vec3_${k}) {
                        g${k}.genValue(p.memory, p.size, ts).multiply(p.startSize);
                    } else {
                        ${scalarValue(`sg${k}`, 'v', 'ts')}
                        size[o3] = startSize[o3] * v;
                        size[o3 + 1] = startSize[o3 + 1] * v;
                        size[o3 + 2] = startSize[o3 + 2] * v;
                    }}`,
            };
        case 'RotationBySpeed':
            return {
                setup: `const b${k} = behaviors[${k}];
                    ${scalarSetup(`g${k}`, `b${k}.angularVelocity`)}
                    const lo${k} = b${k}.speedRange.a;
                    const span${k} = b${k}.speedRange.b - lo${k};
                    const angle_${k} = count > 0 && typeof particles[0].rotation === 'number';`,
                body: `if (angle_${k}) {
                        ${speedFractionOf(k)}
                        ${scalarValue(`g${k}`, 'rate', 'ts')}
                        rot[row] += delta * rate;
                        angVel[row] = rate;
                    }`,
            };
        case 'OrbitOverLife':
            return {
                // The unit axis and the pivot in the simulation space come from the
                // behavior's frameUpdate. A constant orbit speed turns every particle
                // by the same quaternion, built once here instead of a sin/cos per
                // particle. A zero axis orbits nothing.
                setup: `const b${k} = behaviors[${k}];
                    ${scalarSetup(`g${k}`, `b${k}.orbitSpeed`)}
                    ${vectorSetup(`ax${k}`, `b${k}._axis`)}
                    ${vectorSetup(`c${k}`, `b${k}._center`)}
                    const alen${k} = ax${k}x * ax${k}x + ax${k}y * ax${k}y + ax${k}z * ax${k}z;
                    const orbit${k} = alen${k} !== 0;
                    const chalf${k} = (g${k}_cv * delta) / 2;
                    const csn${k} = Math.sin(chalf${k});
                    const cqx${k} = ax${k}x * csn${k}, cqy${k} = ax${k}y * csn${k}, cqz${k} = ax${k}z * csn${k};
                    const cqw${k} = Math.cos(chalf${k});`,
                body: `if (orbit${k}) {
                    let px = Math.fround(pos[o3] - c${k}x), py = Math.fround(pos[o3 + 1] - c${k}y), pz = Math.fround(pos[o3 + 2] - c${k}z);
                    // Divided by the squared length as projectOnVector does, so the bits match.
                    const f = (ax${k}x * px + ax${k}y * py + ax${k}z * pz) / alen${k};
                    const tx = ax${k}x * f, ty = ax${k}y * f, tz = ax${k}z * f;
                    let qx, qy, qz, qw;
                    if (g${k}_const) {
                        qx = cqx${k}; qy = cqy${k}; qz = cqz${k}; qw = cqw${k};
                    } else {
                        ${scalarValue(`g${k}`, 'sp', 't')}
                        const half = (sp * delta) / 2;
                        const sn = Math.sin(half);
                        qx = ax${k}x * sn; qy = ax${k}y * sn; qz = ax${k}z * sn; qw = Math.cos(half);
                    }
                    px = Math.fround(px - tx); py = Math.fround(py - ty); pz = Math.fround(pz - tz);
                    ${rotateInPlace('px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw')}
                    px = Math.fround(Math.fround(px) + tx); py = Math.fround(Math.fround(py) + ty); pz = Math.fround(Math.fround(pz) + tz);
                    pos[o3] = px + c${k}x;
                    pos[o3 + 1] = py + c${k}y;
                    pos[o3 + 2] = pz + c${k}z;}`,
            };
        case 'Rotation3DOverLife':
            return {
                // Whether the particles rotate by quaternion is a property of the
                // system (mesh render mode), read off the first particle once. A
                // fixed axis-angle rate turns every particle by the same step,
                // built once here instead of a sin/cos per particle.
                setup: `const b${k} = behaviors[${k}];
                    const g${k} = b${k}.angularVelocity;
                    const q${k} = b${k}.tempQuat;
                    const rq${k} = store.rotationQuaternion, aq${k} = store.angularVelocityQuaternion;
                    const quat_${k} = rq${k}.length > 0 && count > 0 && particles[0].rotation instanceof deps.Quaternion;
                    const fixed_${k} = g${k} instanceof deps.AxisAngleGenerator && g${k}.angle instanceof deps.ConstantValue;
                    let cqx${k} = 0, cqy${k} = 0, cqz${k} = 0, cqw${k} = 1;
                    if (fixed_${k}) {
                        g${k}.genValue(undefined, q${k}, delta, 0);
                        cqx${k} = q${k}.x; cqy${k} = q${k}.y; cqz${k} = q${k}.z; cqw${k} = q${k}.w;
                    }`,
                // The step's turn is kept for the renderer, which draws a fraction
                // of it when the frame falls between steps.
                body: `if (quat_${k}) {
                        let qx, qy, qz, qw;
                        if (fixed_${k}) {
                            qx = cqx${k}; qy = cqy${k}; qz = cqz${k}; qw = cqw${k};
                        } else {
                            g${k}.genValue(p.memory, q${k}, delta, t);
                            qx = q${k}.x; qy = q${k}.y; qz = q${k}.z; qw = q${k}.w;
                        }
                        const ax = rq${k}[o4], ay = rq${k}[o4 + 1], az = rq${k}[o4 + 2], aw = rq${k}[o4 + 3];
                        rq${k}[o4] = ax * qw + aw * qx + ay * qz - az * qy;
                        rq${k}[o4 + 1] = ay * qw + aw * qy + az * qx - ax * qz;
                        rq${k}[o4 + 2] = az * qw + aw * qz + ax * qy - ay * qx;
                        rq${k}[o4 + 3] = aw * qw - ax * qx - ay * qy - az * qz;
                        aq${k}[o4] = qx; aq${k}[o4 + 1] = qy; aq${k}[o4 + 2] = qz; aq${k}[o4 + 3] = qw;
                    }`,
            };
        case 'VelocityOverLife':
            return {
                setup: `const b${k} = behaviors[${k}];
                    ${scalarSetup(`lx${k}`, `b${k}.linearX`)}
                    ${scalarSetup(`ly${k}`, `b${k}.linearY`)}
                    ${scalarSetup(`lz${k}`, `b${k}.linearZ`)}
                    ${scalarSetup(`ox${k}`, `b${k}.orbitalX`)}
                    ${scalarSetup(`oy${k}`, `b${k}.orbitalY`)}
                    ${scalarSetup(`oz${k}`, `b${k}.orbitalZ`)}
                    ${vectorSetup(`aX${k}`, `b${k}._axisX`)}
                    ${vectorSetup(`aY${k}`, `b${k}._axisY`)}
                    ${vectorSetup(`aZ${k}`, `b${k}._axisZ`)}
                    ${scalarSetup(`rd${k}`, `b${k}.radial`)}
                    ${vectorSetup(`ce${k}`, `b${k}._center`)}
                    const world${k} = b${k}.ps !== undefined && b${k}.ps.worldSpace;
                    const toWorld${k} = world${k} && b${k}.space === 'local';
                    const convert${k} = toWorld${k} || (!world${k} && b${k}.space === 'world');
                    ${vectorSetup(`sc${k}`, `toWorld${k} ? b${k}._tempScale : b${k}._tempScaleInv`)}
                    ${quaternionSetup(`q${k}`, `toWorld${k} ? b${k}._tempQ : b${k}._tempQInv`)}`,
                body: `{
                    ${scalarValue(`lx${k}`, 'fx', 't')}
                    ${scalarValue(`ly${k}`, 'fy', 't')}
                    ${scalarValue(`lz${k}`, 'fz', 't')}
                    if (convert${k}) {
                        fx *= sc${k}x; fy *= sc${k}y; fz *= sc${k}z;
                        ${rotateInPlace('fx', 'fy', 'fz', `q${k}x`, `q${k}y`, `q${k}z`, `q${k}w`)}
                    }
                    let px = Math.fround(pos[o3] + fx * delta);
                    let py = Math.fround(pos[o3 + 1] + fy * delta);
                    let pz = Math.fround(pos[o3 + 2] + fz * delta);
                    ${scalarValue(`rd${k}`, 'radial', 't')}
                    if (radial !== 0) {
                        // Away from the centre, along the line through the particle.
                        const dx = px - ce${k}x, dy = py - ce${k}y, dz = pz - ce${k}z;
                        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (length > 0) {
                            const f = (radial * delta) / length;
                            px = Math.fround(px + dx * f); py = Math.fround(py + dy * f); pz = Math.fround(pz + dz * f);
                        }
                    }
                    ${scalarValue(`ox${k}`, 'rx', 't')}
                    ${scalarValue(`oy${k}`, 'ry', 't')}
                    ${scalarValue(`oz${k}`, 'rz', 't')}
                    rx *= delta; ry *= delta; rz *= delta;
                    if (rx !== 0 || ry !== 0 || rz !== 0) {
                        px = Math.fround(px - ce${k}x); py = Math.fround(py - ce${k}y); pz = Math.fround(pz - ce${k}z);
                        if (rx !== 0) ${orbitInPlace('rx', `aX${k}x`, `aX${k}y`, `aX${k}z`)}
                        if (ry !== 0) ${orbitInPlace('ry', `aY${k}x`, `aY${k}y`, `aY${k}z`)}
                        if (rz !== 0) ${orbitInPlace('rz', `aZ${k}x`, `aZ${k}y`, `aZ${k}z`)}
                        px = Math.fround(px + ce${k}x); py = Math.fround(py + ce${k}y); pz = Math.fround(pz + ce${k}z);
                    }
                    pos[o3] = px; pos[o3 + 1] = py; pos[o3 + 2] = pz;}`,
            };
        case 'InheritVelocity':
            return {
                // The inherited velocity is the emitter's, the same for every
                // particle: converted into the system's space once per pass.
                setup: `const b${k} = behaviors[${k}];
                    const ps${k} = b${k}.ps;
                    const ev${k} = b${k}.mode === 'current' && ps${k} !== undefined ? ps${k}.emitterVelocity : undefined;
                    const active${k} = ev${k} !== undefined;
                    let ivx${k} = 0, ivy${k} = 0, ivz${k} = 0;
                    if (active${k}) {
                        ivx${k} = ev${k}.x; ivy${k} = ev${k}.y; ivz${k} = ev${k}.z;
                        if (!ps${k}.worldSpace) {
                            ${vectorSetup(`sc${k}`, `b${k}._tempScaleInv`)}
                            ${quaternionSetup(`q${k}`, `b${k}._tempQInv`)}
                            ivx${k} *= sc${k}x; ivy${k} *= sc${k}y; ivz${k} *= sc${k}z;
                            ${rotateInPlace(`ivx${k}`, `ivy${k}`, `ivz${k}`, `q${k}x`, `q${k}y`, `q${k}z`, `q${k}w`)}
                        }
                    }
                    ${scalarSetup(`gm${k}`, `b${k}.multiplier`)}`,
                body: `if (active${k}) {
                        ${scalarValue(`gm${k}`, 'm', 't')}
                        const f = m * delta;
                        pos[o3] += ivx${k} * f; pos[o3 + 1] += ivy${k} * f; pos[o3 + 2] += ivz${k} * f;
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
function compile(fragments: Array<Fragment>, indices: Array<number>, key: string): FusedPass | undefined {
    const cached = passCache.get(key);
    if (cached !== undefined) {
        return cached ?? undefined;
    }
    const compiled = generate(fragments, indices);
    passCache.set(key, compiled ?? null);
    return compiled;
}

function generate(fragments: Array<Fragment>, indices: Array<number>): FusedPass | undefined {
    const source = `
        if (count === 0) return;
        if (store === undefined) {
            store = particles[0].store;
            if (store === undefined) {
                // Particles of some other implementation, without columns: run the behaviors as they are.
                for (const k of [${indices.join(', ')}]) {
                    const b = behaviors[k];
                    for (let i = 0; i < count; i++) {
                        const p = particles[i];
                        if (p.age < p.life) b.update(p, delta);
                    }
                }
                return;
            }
        }
        const pos = store.position, vel = store.velocity;
        const size = store.size, startSize = store.startSize;
        const color = store.color, startColor = store.startColor;
        const scalars = store.scalars;
        const rot = store.rotation, angVel = store.angularVelocity;
        const uvTile = store.uvTile, startSpeed = store.startSpeed;
        const mem = store.memory, ms = store.memoryStride;
        ${fragments.map((f) => f.setup).join('\n')}
        // The system keeps particles[i] on row i. Anything else (a hand-built
        // list) is caught by its ends and read through each particle's row.
        const mapped = particles[0].storeIndex !== 0 || particles[count - 1].storeIndex !== count - 1;
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const row = mapped ? p.storeIndex : i;
            const s = row * 3;
            const age = scalars[s], life = scalars[s + 1];
            if (age >= life) continue;
            const t = age / life;
            const o3 = row * 3, o4 = row * 4;
            ${fragments.map((f) => f.body).join('\n')}
        }`;
    try {
        const factory = new Function(
            'deps',
            `const tmpColor = new deps.Vector4View(new Float32Array(4), 0);
            return function (behaviors, particles, count, delta, store) {${source}};`
        );
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
 * still see the particles exactly where the original order left them. A lone
 * recognised behavior is compiled too: the gain is not only the merged loop
 * but the column access, which its own `updateAll` does not have.
 */
export function planBehaviorFusion(behaviors: Array<Behavior>): Array<FusionStep> {
    const steps: Array<FusionStep> = [];
    let runBehaviors: Array<Behavior> = [];
    let runFragments: Array<Fragment> = [];
    let runIndices: Array<number> = [];
    let runStart = 0;

    const flush = () => {
        if (runFragments.length === 0) {
            return;
        }
        const key = `${runStart}:${runBehaviors.map((b) => b.type).join(',')}`;
        const run = compile(runFragments, runIndices, key);
        if (run !== undefined) {
            steps.push({behaviors: runBehaviors, run});
        } else {
            for (const behavior of runBehaviors) {
                steps.push({behaviors: [behavior]});
            }
        }
        runBehaviors = [];
        runFragments = [];
        runIndices = [];
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
        runIndices.push(i);
    }
    flush();
    return steps;
}
