import {Vector4} from '../math';
import {ColorToJSON, describePart, JSONToColor, warnFormat} from '../util/JSONUtil';
import {ColorRange} from './ColorRange';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {Gradient} from './Gradient';
import {RandomColor} from './RandomColor';
import {RandomColorBetweenGradient} from './RandomColorBetweenGradient';

/**
 * A colour that is the same over a particle's life once rolled (a start colour): a constant, or a
 * random pick. Generators that keep state per roll keep it in the {@link GeneratorMemory} given.
 */
export interface ColorGenerator {
    /** `'value'`: the colour does not change with time. */
    type: 'value';
    /**
     * Rolls whatever the generator picks at random into `memory`, before the first {@link
     * ColorGenerator.genColor}.
     */
    startGen(memory: GeneratorMemory): void;
    /**
     * Writes the colour into `color`.
     * @returns `color`.
     */
    genColor(memory: GeneratorMemory, color: Vector4): Vector4;
    /** The generator's JSON. */
    toJSON(): FunctionJSON;
    /** A copy with the same settings. */
    clone(): ColorGenerator;
}

/**
 * A colour that changes over time `t` in [0, 1] (a particle's life fraction, or the system's
 * cycle): a gradient, or a random blend of two.
 */
export interface FunctionColorGenerator {
    /** `'function'`: the colour depends on `t`. */
    type: 'function';
    /**
     * Rolls whatever the generator picks at random into `memory`, before the first {@link
     * FunctionColorGenerator.genColor}.
     */
    startGen(memory: GeneratorMemory): void;
    /**
     * Writes the colour at `t` into `color`.
     * @returns `color`.
     */
    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4;
    /** See FunctionValueGenerator.refreshTable. */
    refreshTable?(): void;
    /** The generator's JSON. */
    toJSON(): FunctionJSON;
    /** A copy with the same settings. */
    clone(): FunctionColorGenerator;
}
/** One colour, always the same (Unity's Color). */
export class ConstantColor implements ColorGenerator {
    /** @param color - The colour, linear RGBA. */
    constructor(public color: Vector4) {
        this.type = 'value';
    }

    /** Does nothing: there is nothing to roll. */
    startGen(memory: GeneratorMemory): void {}
    /**
     * Copies {@link ConstantColor.color} into `color`.
     * @returns `color`.
     */
    genColor(memoryGenerator: GeneratorMemory, color: Vector4): Vector4 {
        return color.copy(this.color);
    }

    /** Always `'value'`. */
    type: 'value';

    /** The JSON form, `{type: 'ConstantColor', color}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'ConstantColor',
            color: ColorToJSON(this.color),
        };
    }

    /** Reads {@link ConstantColor.toJSON} output. */
    static fromJSON(json: FunctionJSON): ConstantColor {
        return new ConstantColor(JSONToColor(json.color));
    }

    /** A copy with its own colour. */
    clone(): ColorGenerator {
        return new ConstantColor(this.color.clone());
    }
}

/** Reads a colour generator; an unknown or missing type warns and gives opaque white. */
export function ColorGeneratorFromJSON(json: FunctionJSON) {
    switch (json?.type) {
        case 'ConstantColor':
            return ConstantColor.fromJSON(json);
        case 'ColorRange':
            return ColorRange.fromJSON(json);
        case 'RandomColor':
            return RandomColor.fromJSON(json);
        case 'Gradient':
            return Gradient.fromJSON(json);
        case 'RandomColorBetweenGradient':
            return RandomColorBetweenGradient.fromJSON(json);
        default:
            warnFormat(`${describePart('colour generator', json)}; using white.`);
            return new ConstantColor(new Vector4(1, 1, 1, 1));
    }
}
