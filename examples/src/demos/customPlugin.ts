import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    type Behavior,
    ConstantValue,
    type FunctionValueGenerator,
    GridEmitter,
    loadPlugin,
    type Particle,
    ParticleSystem,
    type Plugin,
    RenderMode,
    unloadPlugin,
    type ValueGenerator,
    ValueGeneratorFromJSON,
    type ValueGeneratorJSON,
} from 'babylon.quarks';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** The JSON of a {@link SinWave}; every field may be missing, and then takes its default. */
interface SinWaveJSON {
    type: string;
    frequency?: ValueGeneratorJSON;
    height?: ValueGeneratorJSON;
    waveSize?: number;
}

/**
 * A behaviour of our own: it lifts each particle on a travelling sine wave across the system's
 * plane, and colours it by how high the wave carries it, from deep blue in the troughs to white on
 * the crests. Written as docs/EXTENDING.md asks: a prefixed type, generators an artist can turn
 * into curves, read once per particle, `toJSON` writing every field and `fromJSON` giving every
 * missing one its default.
 */
class SinWave implements Behavior {
    static readonly TYPE = 'examples.SinWave';
    type = SinWave.TYPE;
    private time = 0;

    constructor(
        /** Radians a second the wave moves by. */
        public frequency: ValueGenerator | FunctionValueGenerator = new ConstantValue(2),
        /** Crest to trough, in the system's units. */
        public height: ValueGenerator | FunctionValueGenerator = new ConstantValue(2),
        /** The wave's length across the plane, in the system's units. */
        public waveSize = 3
    ) {}

    initialize(particle: Particle): void {
        // Random ranges pick their sample once for each particle.
        this.frequency.startGen(particle.memory);
        this.height.startGen(particle.memory);
    }

    update(particle: Particle): void {
        const t = particle.life > 0 ? particle.age / particle.life : 0;
        const height = this.read(this.height, particle, t);
        const phase =
            this.time * this.read(this.frequency, particle, t) +
            (particle.position.x + particle.position.y) / this.waveSize;
        const wave = Math.sin(phase);
        particle.position.z = (wave * height) / 2;
        // Low is deep blue, high is white.
        const lift = (wave + 1) / 2;
        particle.color.set(0.2 + 0.8 * lift, 0.45 + 0.55 * lift, 1, 1);
    }

    /** A generator's value for the particle: a curve at `t`, its age over its life; a constant or range as sampled. */
    private read(generator: ValueGenerator | FunctionValueGenerator, particle: Particle, t: number): number {
        return generator.type === 'function'
            ? (generator as FunctionValueGenerator).genValue(particle.memory, t)
            : (generator as ValueGenerator).genValue(particle.memory);
    }

    frameUpdate(delta: number): void {
        this.time += delta;
    }

    toJSON(): SinWaveJSON {
        return {
            type: this.type,
            frequency: this.frequency.toJSON(),
            height: this.height.toJSON(),
            waveSize: this.waveSize,
        };
    }

    static fromJSON(json: SinWaveJSON): SinWave {
        return new SinWave(
            json.frequency ? ValueGeneratorFromJSON(json.frequency) : undefined,
            json.height ? ValueGeneratorFromJSON(json.height) : undefined,
            json.waveSize ?? 3
        );
    }

    clone(): SinWave {
        return new SinWave(this.frequency.clone(), this.height.clone(), this.waveSize);
    }

    reset(): void {
        this.time = 0;
    }
}

const wavePlugin: Plugin = {
    id: 'examples.wave',
    initialize: () => {},
    emitterShapes: [],
    behaviors: [
        {
            type: SinWave.TYPE,
            constructor: SinWave,
            params: [
                ['frequency', ['valueFunc']],
                ['height', ['valueFunc']],
                ['waveSize', ['number']],
            ],
            loadJSON: (json) => SinWave.fromJSON(json as SinWaveJSON),
        },
    ],
};

/**
 * A behaviour of our own, registered with `loadPlugin`: a grid of sparks rippling as a travelling
 * wave lifts and colours them. Open it in the editor and the wave's frequency, height and size
 * show as fields, and the effect saves and loads with it. Leaving the demo unloads the plugin
 * (`unloadPlugin`), so its type does not stay registered behind it.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 7, 16));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, -1.2);
    loadPlugin(wavePlugin);

    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.16),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(2500), cycle: 1, interval: 0, probability: 1}],
        shape: new GridEmitter({width: 14, height: 14, column: 50, row: 50}),
        renderMode: RenderMode.BillBoard,
        texture: baseTexture(scene, 'spark'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    system.emitter.name = 'Wave';
    system.addBehavior(new SinWave(new ConstantValue(2), new ConstantValue(2.2), 2.4));
    // The grid lies in the emitter's xy plane and the wave lifts along its z: lay it flat.
    system.emitter.rotation.x = -Math.PI / 2;
    add(system);
    return {dispose: () => unloadPlugin(wavePlugin.id)};
}
