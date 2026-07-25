import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {
    FunctionValueGenerator,
    GeneratorFromJSON,
    Vector3Function,
    Vector3Generator,
} from '../functions';

/**
 *  Apply size to particles based on their life.
 */
export class SizeOverLife implements Behavior {
    type = 'SizeOverLife';

    private _size!: FunctionValueGenerator | Vector3Generator;
    // Cached so the per-particle update does not repeat the instanceof test.
    private _sizeIsVector3 = false;

    constructor(size: FunctionValueGenerator | Vector3Generator) {
        this.size = size;
    }

    get size(): FunctionValueGenerator | Vector3Generator {
        return this._size;
    }

    set size(size: FunctionValueGenerator | Vector3Generator) {
        this._size = size;
        this._sizeIsVector3 = size instanceof Vector3Function;
    }

    initialize(particle: Particle): void {
        this._size.startGen(particle.memory);
    }

    update(particle: Particle): void {
        const t = particle.age / particle.life;
        if (this._sizeIsVector3) {
            (this._size as Vector3Function).genValue(particle.memory, particle.size, t).multiply(particle.startSize);
        } else {
            const scale = (this._size as FunctionValueGenerator).genValue(particle.memory, t);
            const size = particle.size;
            const startSize = particle.startSize;
            size.x = startSize.x * scale;
            size.y = startSize.y * scale;
            size.z = startSize.z * scale;
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        // Split by generator kind once per frame rather than per particle, so
        // each loop keeps a single monomorphic genValue call site.
        if (this._sizeIsVector3) {
            const generator = this._size as Vector3Function;
            for (let i = 0; i < count; i++) {
                const particle = particles[i];
                if (particle.age >= particle.life) {
                    continue;
                }
                generator
                    .genValue(particle.memory, particle.size, particle.age / particle.life)
                    .multiply(particle.startSize);
            }
            return;
        }
        const generator = this._size as FunctionValueGenerator;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const scale = generator.genValue(particle.memory, particle.age / particle.life);
            const size = particle.size;
            const startSize = particle.startSize;
            size.x = startSize.x * scale;
            size.y = startSize.y * scale;
            size.z = startSize.z * scale;
        }
    }
    toJSON(): any {
        return {
            type: this.type,
            size: this.size.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new SizeOverLife(GeneratorFromJSON(json.size) as FunctionValueGenerator);
    }

    frameUpdate(delta: number): void {
        this._size.refreshTable?.();
    }

    clone(): Behavior {
        return new SizeOverLife(this.size.clone());
    }
    reset(): void {}
}
