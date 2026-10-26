/**
 * Checks that a steady frame allocates nothing that grows with the particles: every render mode,
 * and every stock behavior.
 *
 *   npm run check:allocations
 *   npm run check:allocations -- Noise     (only the cases whose name starts with it)
 *
 * A frame that allocates per particle hands the garbage collector work in proportion to the
 * effect, and an effect of a few thousand particles then pauses the page every few seconds. Each
 * case runs a system to a steady state and measures the heap over a window of frames with no
 * collection in it, once with few particles and once with many: what the larger system allocates
 * more, per particle per frame, must stay under {@link PER_PARTICLE}. What a frame allocates
 * whatever the particle count, the numbers boxed by code that runs once a frame, must stay under
 * {@link PER_FRAME}.
 *
 * Particles are emitted at the start and live past the window, so the window measures simulating
 * and drawing alone; emitting is measured on its own, per particle emitted, under
 * {@link PER_SPAWN}, which is not zero, as it says.
 *
 * Node runs it with `--expose-gc` and a fixed new space large enough that no collection falls in a
 * window of frames within budget; a window that saw one is left out.
 */
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BabylonVector3} from '@babylonjs/core/Maths/math.vector';
import {Logger} from '@babylonjs/core/Misc/logger';
import {Scene} from '@babylonjs/core/scene';
import {PerformanceObserver} from 'node:perf_hooks';
import {
    ApplyCollision,
    ApplyForce,
    ApplySequences,
    AxisAngleGenerator,
    Behavior,
    BehaviorTypes,
    Bezier,
    ChangeEmitDirection,
    ColorBySpeed,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EmitterShape,
    ForceOverLife,
    FrameOverLife,
    Gradient,
    GravityForce,
    InheritVelocity,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    PiecewiseBezier,
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
    WidthOverLength,
} from 'quarks.core';
import {BatchedRenderer} from '../packages/babylon.quarks/src/BatchedRenderer';
import {RenderMode, type SortMode} from '../packages/babylon.quarks/src/batchSettings';
import {ParticleSystem} from '../packages/babylon.quarks/src/ParticleSystem';

/** Bytes a frame may allocate per particle more, between a small and a large system. */
const PER_PARTICLE = 0.25;
/** Bytes a frame may allocate whatever the particle count. */
const PER_FRAME = 2048;
/**
 * Bytes emitting a particle may allocate. Not zero: a particle's generator memory is a plain
 * `number[]` (`GeneratorMemory`) that is emptied when the particle is reused and grown again as
 * its generators push their samples, and the engine gives an emptied array a new backing store.
 * About 150 of the 250 or so bytes a particle costs are that; an emitter of a few thousand particles a second
 * hands the collector a few hundred kilobytes a second, a minor collection every half minute.
 */
const PER_SPAWN = 384;

const FEW = 300;
const MANY = 2000;
const WARM_FRAMES = 1200;
const WINDOW_FRAMES = 300;

Logger.LogLevels = Logger.NoneLogLevel;
const gc = (globalThis as {gc?: () => void}).gc;
if (gc === undefined) {
    console.error('Run with node --expose-gc (npm run check:allocations does).');
    process.exit(2);
}
let collections = 0;
new PerformanceObserver((list) => (collections += list.getEntries().length)).observe({entryTypes: ['gc']});
/** Lets the observer hear of the collections so far. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

const curve = () => new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0), 0]]);
const fade = () =>
    new Gradient([
        [new Vector4(1, 1, 1, 1), 0],
        [new Vector4(1, 0.5, 0.2, 0), 1],
    ]);

interface Case {
    name: string;
    renderMode: RenderMode;
    behaviors: () => Behavior[];
    shape?: () => EmitterShape;
    sortMode?: SortMode;
}

/** Behaviors measured elsewhere, with the reason. */
const EXEMPT: Record<string, string> = {
    EmitSubParticleSystem: 'emits into another system: what it costs is emitting, measured per particle emitted',
};

const behaviorCases: Array<[string, () => Behavior, RenderMode?]> = [
    [
        'ApplyCollision',
        () => new ApplyCollision({resolve: (p, n) => p.y < -2 && ((n.x = 0), (n.y = 1), (n.z = 0), true)}, 0.5),
    ],
    ['ApplyForce', () => new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(5))],
    ['ApplySequences', () => new ApplySequences(0.01)],
    ['ChangeEmitDirection', () => new ChangeEmitDirection(new ConstantValue(0.5))],
    ['ColorBySpeed', () => new ColorBySpeed(fade(), new IntervalValue(0, 10))],
    ['ColorOverLife', () => new ColorOverLife(fade())],
    ['ForceOverLife', () => new ForceOverLife(curve(), new ConstantValue(-2), curve())],
    ['FrameOverLife', () => new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 2, 4, 6), 0]]))],
    ['GravityForce', () => new GravityForce(new Vector3(0, 8, 0), 30)],
    ['InheritVelocity', () => new InheritVelocity(new ConstantValue(0.5), 'current')],
    ['LimitSpeedOverLife', () => new LimitSpeedOverLife(curve(), 0.5)],
    ['Noise', () => new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(1), new ConstantValue(1))],
    [
        'Noise',
        () =>
            new Noise(
                new ConstantValue(1),
                new ConstantValue(1),
                new ConstantValue(1),
                new ConstantValue(1),
                new ConstantValue(0.5),
                curve()
            ),
        RenderMode.Mesh,
    ],
    ['OrbitOverLife', () => new OrbitOverLife(new ConstantValue(3), new Vector3(0, 1, 0))],
    [
        'Rotation3DOverLife',
        () => new Rotation3DOverLife(new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(3))),
        RenderMode.Mesh,
    ],
    ['RotationBySpeed', () => new RotationBySpeed(new ConstantValue(4), new IntervalValue(0, 10))],
    ['RotationOverLife', () => new RotationOverLife(new ConstantValue(2))],
    ['SizeBySpeed', () => new SizeBySpeed(curve(), new IntervalValue(0, 10))],
    ['SizeOverLife', () => new SizeOverLife(curve())],
    ['SpeedOverLife', () => new SpeedOverLife(curve())],
    ['TurbulenceField', () => new TurbulenceField(new Vector3(2, 2, 2), 2, new Vector3(1, 1, 1), new Vector3(1, 1, 1))],
    [
        'VelocityOverLife',
        () =>
            new VelocityOverLife(
                new ConstantValue(2),
                new ConstantValue(1),
                new ConstantValue(0),
                new ConstantValue(1)
            ),
    ],
    ['WidthOverLength', () => new WidthOverLength(curve()), RenderMode.Trail],
    ['ColorOverLife', () => new ColorOverLife(fade()), RenderMode.Trail],
];

/** The behaviors that apply in `renderMode`, all at once, as an effect stacks them. */
function everyBehavior(renderMode: RenderMode): Behavior[] {
    const only: Record<string, RenderMode> = {Rotation3DOverLife: RenderMode.Mesh, WidthOverLength: RenderMode.Trail};
    const seen = new Set<string>();
    const behaviors: Behavior[] = [];
    for (const [name, behavior] of behaviorCases) {
        if (seen.has(name) || (name in only && only[name] !== renderMode)) continue;
        seen.add(name);
        behaviors.push(behavior());
    }
    return behaviors;
}

function cases(): Case[] {
    const modes = Object.values(RenderMode).filter((mode): mode is RenderMode => typeof mode === 'number');
    return [
        ...modes.map((renderMode) => ({
            name: `${RenderMode[renderMode]}, no behaviors`,
            renderMode,
            behaviors: () => [],
        })),
        ...modes.map((renderMode) => ({
            name: `${RenderMode[renderMode]}, every behavior`,
            renderMode,
            behaviors: () => everyBehavior(renderMode),
        })),
        ...(['oldestInFront', 'distance'] as const).map((sortMode) => ({
            name: `BillBoard, sorted ${sortMode}`,
            renderMode: RenderMode.BillBoard,
            behaviors: () => [],
            sortMode,
        })),
        ...behaviorCases.map(([name, behavior, renderMode = RenderMode.BillBoard]) => ({
            name: `${name}${renderMode === RenderMode.BillBoard ? '' : `, ${RenderMode[renderMode]}`}`,
            renderMode,
            behaviors: () => [behavior()],
        })),
    ];
}

const engine = new NullEngine();

function build(testCase: Case, count: number, emitting: boolean) {
    const scene = new Scene(engine);
    // Sorting by distance sorts from the camera.
    if (testCase.sortMode !== undefined) new FreeCamera('camera', new BabylonVector3(0, 0, -10), scene);
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        worldSpace: true,
        renderMode: testCase.renderMode,
        maxParticles: count * 2,
        startLife: emitting ? new IntervalValue(0.5, 1.5) : new ConstantValue(1e6),
        startSpeed: new ConstantValue(5),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(emitting ? count : 0),
        emissionBursts: emitting
            ? []
            : [{time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1}],
        shape: testCase.shape?.() ?? new SphereEmitter(),
        rendererEmitterSettings: (testCase.renderMode === RenderMode.Trail
            ? {startLength: new ConstantValue(10)}
            : testCase.renderMode === RenderMode.StretchedBillBoard
              ? {speedFactor: 1, lengthFactor: 1}
              : {}) as never,
        behaviors: testCase.behaviors(),
        sortMode: testCase.sortMode,
        uTileCount: 4,
        vTileCount: 4,
    });
    const renderer = new BatchedRenderer('allocations', scene);
    renderer.addSystem(system);
    system.play();
    return {
        system,
        renderer,
        dispose: () => {
            renderer.dispose();
            scene.dispose();
        },
    };
}

/**
 * Bytes a frame allocates, on average over a window with no collection in it: the least of a few
 * windows, since code the engine has not finished optimising boxes numbers that it later will not.
 */
async function bytesPerFrame(renderer: BatchedRenderer): Promise<number> {
    let least = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
        gc!();
        await settle();
        await settle();
        const seen = collections;
        const before = process.memoryUsage().heapUsed;
        for (let i = 0; i < WINDOW_FRAMES; i++) renderer.update(1 / 60);
        const after = process.memoryUsage().heapUsed;
        await settle();
        // A window a collection ran in, even one the observer has not reported yet and that so
        // reads as freeing memory, says nothing about what the frames allocated.
        if (collections === seen && after >= before) {
            least = Math.min(least, (after - before) / WINDOW_FRAMES);
        }
    }
    // Infinity when every window saw a collection: a frame that fills the new space allocates far
    // past any budget, and the case fails.
    return least;
}

async function steady(testCase: Case, count: number) {
    const {system, renderer, dispose} = build(testCase, count, false);
    for (let i = 0; i < WARM_FRAMES; i++) renderer.update(1 / 60);
    const bytes = await bytesPerFrame(renderer);
    const particles = system.particleNum;
    dispose();
    return {bytes, particles};
}

let failures = 0;
const fail = (line: string) => {
    failures++;
    return `${line}  <-- over budget`;
};

console.log('Bytes a steady frame allocates\n');
console.log(`  ${'case'.padEnd(34)} ${'per frame'.padStart(10)} ${'per particle'.padStart(13)}`);
console.log('  ' + '-'.repeat(59));
const covered = new Set<string>();
const only = process.argv[2];
// The engine's code warmed once before any case is measured, so the first is not charged for it.
await steady({name: 'warm-up', renderMode: RenderMode.BillBoard, behaviors: () => []}, FEW);
for (const testCase of cases()) {
    covered.add(testCase.name.split(',')[0]);
    if (only !== undefined && !testCase.name.startsWith(only)) continue;
    const few = await steady(testCase, FEW);
    const many = await steady(testCase, MANY);
    const perParticle =
        Number.isFinite(few.bytes) && Number.isFinite(many.bytes)
            ? Math.max(0, (many.bytes - few.bytes) / (many.particles - few.particles))
            : Infinity;
    // Both sizes carry the per-frame part; the smaller reading has less of the engine's own
    // tiering in it.
    const perFrame = Math.min(few.bytes, many.bytes);
    const line = `  ${testCase.name.padEnd(34)} ${perFrame.toFixed(0).padStart(10)} ${perParticle.toFixed(2).padStart(13)}`;
    console.log(perParticle > PER_PARTICLE || perFrame > PER_FRAME ? fail(line) : line);
}

console.log('\nBytes emitting a particle allocates\n');
async function emitting(testCase: Case, perSecond: number): Promise<number> {
    const {renderer, dispose} = build(testCase, perSecond, true);
    for (let i = 0; i < WARM_FRAMES; i++) renderer.update(1 / 60);
    const bytes = await bytesPerFrame(renderer);
    dispose();
    return bytes;
}

for (const renderMode of [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail]) {
    const testCase: Case = {name: RenderMode[renderMode], renderMode, behaviors: () => []};
    // What emitting MANY a second allocates more than emitting FEW, per particle emitted.
    const few = await emitting(testCase, FEW);
    const many = await emitting(testCase, MANY);
    const perSpawn =
        Number.isFinite(few) && Number.isFinite(many) ? Math.max(0, (many - few) / ((MANY - FEW) / 60)) : Infinity;
    const line = `  ${testCase.name.padEnd(34)} ${perSpawn.toFixed(0).padStart(10)}`;
    console.log(perSpawn > PER_SPAWN ? fail(line) : line);
}

const missing = Object.keys(BehaviorTypes).filter((type) => !covered.has(type) && !(type in EXEMPT));
for (const type of missing) {
    failures++;
    console.log(`\n${type} is registered but has no case here; add one, or exempt it with the reason.`);
}
for (const [type, reason] of Object.entries(EXEMPT)) {
    console.log(`\n${type} is not measured on its own: ${reason}.`);
}

console.log(
    `\n${failures === 0 ? 'Every case' : `${failures} case(s) over budget;`} within ${PER_PARTICLE} B per particle and ` +
        `${PER_FRAME} B per frame, and ${PER_SPAWN} B per particle emitted.`
);
process.exit(failures === 0 ? 0 : 1);
