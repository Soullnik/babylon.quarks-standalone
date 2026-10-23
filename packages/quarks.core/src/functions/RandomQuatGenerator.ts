import {Quaternion} from '../math';
import {random} from '../util/random';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RotationGenerator} from './RotationGenerator';

/**
 * A uniformly random rotation, rolled once per particle and kept for its life. Call
 * {@link RandomQuatGenerator.startGen} with each particle's memory when it spawns.
 */
export class RandomQuatGenerator implements RotationGenerator {
    /** Always `'rotation'`. */
    type: 'rotation';

    constructor() {
        this.type = 'rotation';
    }

    /**
     * The first of the four {@link GeneratorMemory} slots the roll lives in; -1 until the first
     * {@link RandomQuatGenerator.startGen}.
     * @internal
     */
    indexCount = -1;

    // Four numeric slots rather than one Quaternion object: nothing is allocated
    // per spawn, and the numbers can be mirrored into the store's memory column.
    /** Rolls the particle's rotation into four new slots of `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.indexCount = memory.length;
        let x, y, z, u, v, w;
        do {
            x = random() * 2 - 1;
            y = random() * 2 - 1;
            z = x * x + y * y;
        } while (z > 1);
        do {
            u = random() * 2 - 1;
            v = random() * 2 - 1;
            w = u * u + v * v;
        } while (w > 1);
        const s = Math.sqrt((1 - z) / w);
        memory.push(x, y, s * u, s * v);
    }

    /**
     * Writes the particle's rotation into `quat`.
     * @returns `quat`.
     */
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t: number): Quaternion {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        const index = this.indexCount;
        quat.set(memory[index], memory[index + 1], memory[index + 2], memory[index + 3]);
        return quat;
    }

    /** The JSON form, `{type: 'RandomQuat'}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'RandomQuat',
        };
    }

    /** Reads {@link RandomQuatGenerator.toJSON} output. */
    static fromJSON(json: FunctionJSON): RotationGenerator {
        return new RandomQuatGenerator();
    }

    /** A new generator. */
    clone(): RotationGenerator {
        return new RandomQuatGenerator();
    }
}
