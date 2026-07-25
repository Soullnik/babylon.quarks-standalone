import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {FunctionValueGenerator, PiecewiseBezier, ValueGeneratorFromJSON} from '../functions';

/**
 * apply tile number of particle texture by particles' life.
 */
export class FrameOverLife implements Behavior {
    type = 'FrameOverLife';

    private _frame!: FunctionValueGenerator;
    // Cached so the per-particle update does not repeat the instanceof test.
    private _frameIsBezier = false;

    constructor(frame: FunctionValueGenerator) {
        this.frame = frame;
    }

    get frame(): FunctionValueGenerator {
        return this._frame;
    }

    set frame(frame: FunctionValueGenerator) {
        this._frame = frame;
        this._frameIsBezier = frame instanceof PiecewiseBezier;
    }

    initialize(particle: Particle): void {
        this._frame.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        if (this._frameIsBezier) {
            particle.uvTile = this._frame.genValue(particle.memory, particle.age / particle.life);
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        if (!this._frameIsBezier) {
            return;
        }
        const generator = this._frame;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.uvTile = generator.genValue(particle.memory, particle.age / particle.life);
        }
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
        return new FrameOverLife(ValueGeneratorFromJSON(json.frame) as FunctionValueGenerator);
    }

    clone(): Behavior {
        return new FrameOverLife(this.frame.clone());
    }
    reset(): void {}
}
