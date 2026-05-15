import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    ParticleSystem,
    ConstantValue,
    GridEmitter,
    RenderMode,
    RandomColor,
    loadPlugin,
    ValueGeneratorFromJSON,
    Vector4,
    type Behavior,
    type FunctionJSON,
    type FunctionValueGenerator,
    type GeneratorMemory,
    type Particle,
    type Plugin,
    type ValueGenerator,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';

interface SinWaveJSON {
    type: string;
    frequency: FunctionJSON;
    height: FunctionJSON;
    waveSize: number;
}

class SinWave implements Behavior {
    type = 'SinWave';
    frequency: ValueGenerator | FunctionValueGenerator;
    height: ValueGenerator | FunctionValueGenerator;
    waveSize: number;
    time = 0;

    constructor(frequency: ValueGenerator | FunctionValueGenerator, height: ValueGenerator | FunctionValueGenerator, waveSize: number) {
        this.frequency = frequency;
        this.height = height;
        this.waveSize = waveSize;
    }

    initialize() {}

    private sampleValue(generator: ValueGenerator | FunctionValueGenerator, memory: GeneratorMemory, timeRatio: number): number {
        if (generator.type === 'function') {
            return (generator as FunctionValueGenerator).genValue(memory, timeRatio);
        }
        return generator.genValue(memory);
    }

    update(particle: Particle) {
        const lifeProgress = particle.life > 0 ? particle.age / particle.life : 0;
        const height = this.sampleValue(this.height, particle.memory, lifeProgress);
        particle.position.z =
            Math.sin(
                this.time * this.sampleValue(this.frequency, particle.memory, lifeProgress) +
                    (particle.position.x + particle.position.y) * (1 / this.waveSize)
            ) *
                height -
            height / 2;
    }

    frameUpdate(delta: number) {
        this.time += delta;
    }

    toJSON() {
        return {
            type: this.type,
            frequency: this.frequency.toJSON(),
            height: this.height.toJSON(),
            waveSize: this.waveSize,
        };
    }

    static fromJSON(json: SinWaveJSON) {
        return new SinWave(
            ValueGeneratorFromJSON(json.frequency),
            ValueGeneratorFromJSON(json.height),
            json.waveSize
        );
    }

    clone() {
        return new SinWave(this.frequency.clone(), this.height.clone(), this.waveSize);
    }

    reset() {}
}

const sinWavePlugin: Plugin = {
    id: 'MyPlugin',
    initialize: () => {},
    emitterShapes: [],
    behaviors: [
        {
            type: 'SinWave',
            constructor: SinWave,
            params: [
                ['frequency', ['valueFunc']],
                ['height', ['valueFunc']],
                ['waveSize', ['number']],
            ],
            loadJSON: SinWave.fromJSON,
        },
    ],
};

let isPluginLoaded = false;

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 7, 14));
    const texture = createSharedTexture(scene);

    if (!isPluginLoaded) {
        loadPlugin(sinWavePlugin);
        isPluginLoaded = true;
    }

    const system = new ParticleSystem({
        scene,
        duration: 10000,
        looping: false,
        startLife: new ConstantValue(10000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.1),
        startColor: new RandomColor(new Vector4(1, 1, 1, 1), new Vector4(0.85, 0.85, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(2500), cycle: 1, interval: 1, probability: 1}],
        shape: new GridEmitter({width: 15, height: 15, column: 50, row: 50}),
        renderMode: RenderMode.BillBoard,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderOrder: 0,
    });
    system.addBehavior(new SinWave(new ConstantValue(2), new ConstantValue(5), 5));
    system.emitter.scaling.set(0.8, 0.8, 0.8);
    batchRenderer.addSystem(system);
    systems.push(system);
}
