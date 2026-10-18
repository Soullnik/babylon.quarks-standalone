import {Quaternion} from '../math';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RotationGenerator} from './RotationGenerator';

export class RandomQuatGenerator implements RotationGenerator {
    type: 'rotation';

    constructor() {
        this.type = 'rotation';
    }

    indexCount = 0;

    // Four numeric slots rather than one Quaternion object: nothing is allocated
    // per spawn, and the numbers can be mirrored into the store's memory column.
    startGen(memory: GeneratorMemory): void {
        this.indexCount = memory.length;
        let x, y, z, u, v, w;
        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            z = x * x + y * y;
        } while (z > 1);
        do {
            u = Math.random() * 2 - 1;
            v = Math.random() * 2 - 1;
            w = u * u + v * v;
        } while (w > 1);
        const s = Math.sqrt((1 - z) / w);
        memory.push(x, y, s * u, s * v);
    }

    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t: number): Quaternion {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        const index = this.indexCount;
        quat.set(memory[index], memory[index + 1], memory[index + 2], memory[index + 3]);
        return quat;
    }

    toJSON(): FunctionJSON {
        return {
            type: 'RandomQuat',
        };
    }

    static fromJSON(json: FunctionJSON): RotationGenerator {
        return new RandomQuatGenerator();
    }

    clone(): RotationGenerator {
        return new RandomQuatGenerator();
    }
}
