import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Behavior} from './Behavior';

/**
 * apply tile number of particle texture by particles' life.
 */
export class FrameOverLife implements Behavior {
    type = 'FrameOverLife';

    private _frame!: FunctionValueGenerator | ValueGenerator;

    constructor(frame: FunctionValueGenerator | ValueGenerator) {
        this.frame = frame;
    }

    get frame(): FunctionValueGenerator | ValueGenerator {
        return this._frame;
    }

    set frame(frame: FunctionValueGenerator | ValueGenerator) {
        this._frame = frame;
    }

    initialize(particle: Particle): void {
        this._frame.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        particle.uvTile = this.sampleFrame(particle, particle.age / particle.life);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.uvTile = this.sampleFrame(particle, particle.age / particle.life);
        }
    }

    private sampleFrame(particle: Particle, t: number): number {
        return this._frame.type === 'function'
            ? this._frame.genValue(particle.memory, t)
            : this._frame.genValue(particle.memory);
    }

    frameUpdate(delta: number): void {
        this._frame.refreshTable?.();
    }

    toJSON(): any {
        return {
            type: this.type,
            frame: this.frame.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new FrameOverLife(ValueGeneratorFromJSON(json.frame) as FunctionValueGenerator | ValueGenerator);
    }

    clone(): Behavior {
        return new FrameOverLife(this.frame.clone());
    }
    reset(): void {}
}
