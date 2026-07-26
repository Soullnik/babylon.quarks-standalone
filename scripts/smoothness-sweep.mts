/**
 * Sweeps every render mode and behavior for attributes the renderer draws but
 * does not carry between simulation steps.
 *
 *   npx tsx scripts/smoothness-sweep.mts
 *
 * The simulation runs on a fixed 1/60 step while frames do not, so a frame can
 * land between two steps and run none at all. Anything the renderer uploads
 * straight from the last step then sits still on that frame and jumps double on
 * the next: sixty frames a second on the counter, visible stutter on the screen.
 * Every smoothness bug found in this library has had exactly that shape —
 * position, then orbits and plugins, then size and colour, then the stretched
 * billboard's velocity. Rather than wait for the next one to be noticed, this
 * looks for the shape itself.
 *
 * No expected values are needed. Each configuration is driven twice: once with
 * frames landing exactly on the step, where every animated attribute must change
 * every frame, and once with frames landing off it. An attribute that animates
 * in the first run but freezes on some frames of the second is not being carried
 * between steps.
 *
 * Discrete attributes are the honest exception — a flipbook's tile index is
 * meant to hold still between frames — so they are listed as accepted rather
 * than hidden, and the report says which is which.
 */
import {Logger} from '@babylonjs/core/Misc/logger';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    AxisAngleGenerator,
    Behavior,
    Bezier,
    ColorBySpeed,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
    GravityForce,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    Particle,
    PiecewiseBezier,
    PointEmitter,
    Rotation3DOverLife,
    RotationBySpeed,
    RotationOverLife,
    SizeBySpeed,
    SizeOverLife,
    SpeedOverLife,
    SphereEmitter,
    TurbulenceField,
    Vector3,
    Vector4,
    VelocityOverLife,
} from 'quarks.core';
import {ParticleSystem} from '../packages/babylon.quarks/src/ParticleSystem';
import {BatchedRenderer} from '../packages/babylon.quarks/src/BatchedRenderer';
import {RenderMode} from '../packages/babylon.quarks/src/VFXBatch';

/** Attributes the sprite batch uploads, by the buffer they land in. */
const SPRITE_ATTRIBUTES = ['position', 'size', 'colour', 'rotation', 'uvTile', 'velocity'] as const;
type Attribute = (typeof SPRITE_ATTRIBUTES)[number] | 'ribbon';

/**
 * Attributes that step on purpose. A flipbook holds a tile until it changes;
 * carrying it between steps would blend frames that are meant to be discrete.
 */
const DISCRETE: ReadonlySet<Attribute> = new Set<Attribute>(['uvTile']);

Logger.LogLevels = Logger.NoneLogLevel;

const curve = () => new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0), 0]]);
const fade = () =>
    new Gradient([
        [new Vector4(1, 1, 1, 1), 0],
        [new Vector4(1, 0.5, 0.2, 0), 1],
    ]);

/** A behavior the library does not know, standing in for anything a plugin does. */
class PluginDrift implements Behavior {
    type = 'PluginDrift';
    initialize(): void {}
    frameUpdate(): void {}
    update(particle: Particle, delta: number): void {
        particle.position.x += delta * 3;
    }
    toJSON(): unknown {
        return {type: this.type};
    }
    clone(): Behavior {
        return new PluginDrift();
    }
    reset(): void {}
}

interface Case {
    name: string;
    renderMode: RenderMode;
    behaviors: () => Behavior[];
    /** Quaternion rotation needs mesh mode; trails need their settings. */
    settings?: unknown;
}

function cases(): Case[] {
    const sprite = (name: string, behaviors: () => Behavior[], renderMode = RenderMode.BillBoard): Case => ({
        name,
        renderMode,
        behaviors,
    });
    return [
        sprite('nothing (motion only)', () => []),
        sprite('SizeOverLife', () => [new SizeOverLife(curve())]),
        sprite('ColorOverLife', () => [new ColorOverLife(fade())]),
        sprite('RotationOverLife', () => [new RotationOverLife(new ConstantValue(4))]),
        sprite('FrameOverLife', () => [new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 2, 4, 6), 0]]))]),
        sprite('SpeedOverLife', () => [new SpeedOverLife(curve())]),
        sprite('ApplyForce', () => [new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(20))]),
        sprite('GravityForce', () => [new GravityForce(new Vector3(0, 8, 0), 30)]),
        sprite('LimitSpeedOverLife', () => [new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(8, 6, 4, 2), 0]]), 0.5)]),
        sprite('OrbitOverLife', () => [new OrbitOverLife(new ConstantValue(3), new Vector3(0, 1, 0))]),
        sprite('VelocityOverLife', () => [
            new VelocityOverLife(new ConstantValue(2), new ConstantValue(1), new ConstantValue(0), new ConstantValue(1)),
        ]),
        sprite('Noise', () => [new Noise(new ConstantValue(2), new ConstantValue(4))]),
        sprite('TurbulenceField', () => [
            new TurbulenceField(new Vector3(2, 2, 2), 2, new Vector3(4, 4, 4), new Vector3(1, 1, 1)),
        ]),
        sprite('ColorBySpeed', () => [new ColorBySpeed(fade(), new IntervalValue(0, 30))]),
        sprite('SizeBySpeed', () => [new SizeBySpeed(curve(), new IntervalValue(0, 30))]),
        sprite('RotationBySpeed', () => [new RotationBySpeed(new ConstantValue(4), new IntervalValue(0, 30))]),
        sprite('a plugin moving position', () => [new PluginDrift()]),
        sprite('stretched, decelerating', () => [new ApplyForce(new Vector3(0, 0, -1), new ConstantValue(20))],
            RenderMode.StretchedBillBoard),
        {
            name: 'mesh, Rotation3DOverLife',
            renderMode: RenderMode.Mesh,
            behaviors: () => [
                new Rotation3DOverLife(new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(3))),
            ],
        },
        {
            name: 'trail, moving',
            renderMode: RenderMode.Trail,
            settings: {startLength: new ConstantValue(12), followLocalOrigin: false},
            behaviors: () => [],
        },
    ];
}

function build(scene: Scene, testCase: Case) {
    const system = new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(6),
        startSpeed: new ConstantValue(12),
        startSize: new ConstantValue(2),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: testCase.renderMode === RenderMode.Trail ? new PointEmitter() : new SphereEmitter(),
        renderMode: testCase.renderMode,
        rendererEmitterSettings: (testCase.settings ?? {speedFactor: 1, lengthFactor: 0}) as never,
        behaviors: testCase.behaviors(),
        uTileCount: 4,
        vTileCount: 4,
    });
    const renderer = new BatchedRenderer('sweep', scene);
    renderer.addSystem(system);
    system.play();
    return {system, renderer};
}

/** Everything the batch uploaded for the first particle, as flat numbers. */
function sample(renderer: BatchedRenderer, renderMode: RenderMode, particle?: Particle): Map<Attribute, number[]> {
    const batch = renderer.batches[0] as unknown as Record<string, Float32Array | undefined>;
    const out = new Map<Attribute, number[]>();
    if (renderMode === RenderMode.Trail) {
        // The newest sample, not the oldest: the rest of a ribbon is recorded
        // history and is meant to stay where it was put.
        const positions = batch.positionBuffer;
        const history = (particle as unknown as {historyCount?: number})?.historyCount ?? 0;
        const head = Math.max(0, history - 1) * 2 * 3;
        out.set('ribbon', positions ? Array.from(positions.subarray(head, head + 3)) : []);
        return out;
    }
    const take = (name: string, count: number) => {
        const buffer = batch[name];
        return buffer ? Array.from(buffer.subarray(0, count)) : [];
    };
    out.set('position', take('offsetBuffer', 3));
    out.set('size', take('sizeBuffer', 3));
    out.set('colour', take('colorBuffer', 4));
    out.set('rotation', take('rotationBuffer', renderMode === RenderMode.Mesh ? 4 : 1));
    out.set('uvTile', take('uvTileBuffer', 1));
    if (renderMode === RenderMode.StretchedBillBoard) out.set('velocity', take('velocityBuffer', 4));
    return out;
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Drives one case at the given frame length and reports, per attribute, how
 * many frames left it untouched and whether it moved at all.
 */
function drive(testCase: Case, frameSeconds: number, frames: number) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const {system, renderer} = build(scene, testCase);
    for (let i = 0; i < 30; i++) renderer.update(1 / 60);

    const still = new Map<Attribute, number>();
    const moved = new Map<Attribute, boolean>();
    const tracked = system.particles[0];
    let previous = sample(renderer, testCase.renderMode, tracked);
    let compared = 0;
    for (let i = 0; i < frames; i++) {
        renderer.update(frameSeconds);
        if (system.particles[0] !== tracked) break;
        const current = sample(renderer, testCase.renderMode, tracked);
        compared++;
        for (const [attribute, values] of current) {
            const unchanged = same(values, previous.get(attribute) ?? []);
            still.set(attribute, (still.get(attribute) ?? 0) + (unchanged ? 1 : 0));
            if (!unchanged) moved.set(attribute, true);
        }
        previous = current;
    }
    renderer.dispose();
    scene.dispose();
    engine.dispose();
    return {still, moved, compared};
}

const FRAMES = 240;
let gaps = 0;
let accepted = 0;

console.log('Attributes that freeze when a frame runs no simulation step\n');
console.log('  case                          attribute   frozen frames');
console.log('  ' + '-'.repeat(58));

for (const testCase of cases()) {
    // On the step: every frame runs exactly one, so anything animated must move.
    const onGrid = drive(testCase, 1 / 60, FRAMES);
    // Off it: frames land between steps and some run none at all.
    const offGrid = drive(testCase, 1 / 100, FRAMES);
    const reported: string[] = [];
    for (const attribute of offGrid.still.keys()) {
        // Only attributes this case actually animates can be judged.
        if (!onGrid.moved.get(attribute)) continue;
        const frozen = offGrid.still.get(attribute) ?? 0;
        if (frozen === 0) continue;
        const share = ((frozen / offGrid.compared) * 100).toFixed(0);
        if (DISCRETE.has(attribute)) {
            accepted++;
            reported.push(`${attribute.padEnd(11)} ${share.padStart(3)}%  (discrete on purpose)`);
        } else {
            gaps++;
            reported.push(`${attribute.padEnd(11)} ${share.padStart(3)}%  <-- not carried between steps`);
        }
    }
    if (reported.length === 0) {
        console.log(`  ${testCase.name.padEnd(29)} clean`);
    } else {
        for (const [i, line] of reported.entries()) {
            console.log(`  ${(i === 0 ? testCase.name : '').padEnd(29)} ${line}`);
        }
    }
}

console.log('');
console.log(`${gaps} attribute(s) not carried between steps, ${accepted} discrete by design.`);
process.exit(gaps === 0 ? 0 : 1);
