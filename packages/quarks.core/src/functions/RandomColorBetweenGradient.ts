import {Vector4} from '../math';
import {random} from '../util/random';
import {FunctionColorGenerator} from './ColorGenerator';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {Gradient} from './Gradient';

const tempColor: Vector4 = new Vector4();

/**
 * A colour over the particle's life between two gradients, at a mix rolled once per particle (Unity's
 * Random Between Two Gradients). Call `startGen` with each particle's memory when it spawns.
 */
export class RandomColorBetweenGradient implements FunctionColorGenerator {
    /** The first gradient. */
    public gradient1: Gradient;
    /** The second gradient. */
    public gradient2: Gradient;
    /** Always `'function'`: the colour changes over the life. */
    public type: 'function';
    /** The {@link GeneratorMemory} slot of the mix; -1 until the first `startGen`. */
    private indexCount = -1;
    constructor(gradient1: Gradient, gradient2: Gradient) {
        this.type = 'function';
        this.gradient1 = gradient1;
        this.gradient2 = gradient2;
    }

    /** Rolls the particle's mix between the gradients into a new slot of `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.indexCount = memory.length;
        memory.push(random());
    }

    /**
     * Writes into `color` the mix, at the particle's roll, of the two gradients at `t`.
     * @returns `color`.
     */
    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4 {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        this.gradient1.genColor(memory, color, t);
        this.gradient2.genColor(memory, tempColor, t);
        return color.lerp(tempColor, memory[this.indexCount]);
    }

    /** The JSON form, `{type: 'RandomColorBetweenGradient', gradient1, gradient2}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'RandomColorBetweenGradient',
            gradient1: this.gradient1.toJSON(),
            gradient2: this.gradient2.toJSON(),
        };
    }

    /** Reads {@link RandomColorBetweenGradient.toJSON} output. */
    static fromJSON(json: FunctionJSON): RandomColorBetweenGradient {
        return new RandomColorBetweenGradient(Gradient.fromJSON(json.gradient1), Gradient.fromJSON(json.gradient2));
    }

    /** A copy with copies of both gradients. */
    clone(): RandomColorBetweenGradient {
        return new RandomColorBetweenGradient(this.gradient1.clone() as Gradient, this.gradient2.clone() as Gradient);
    }
}
