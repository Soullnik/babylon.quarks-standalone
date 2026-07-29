import {MathUtils} from '../math';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {PiecewiseBezier} from './PiecewiseBezier';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';

/**
 * Unity MinMaxCurve "Two Curves" mode: pick a random lerp factor once at spawn,
 * then each frame evaluate both curves at `t` and lerp between them.
 * Mirrors {@link RandomColorBetweenGradient} for scalar curves.
 */
export class RandomBetweenCurves implements FunctionValueGenerator {
    type: 'function' = 'function';
    private indexCount = -1;

    constructor(
        public a: FunctionValueGenerator | ValueGenerator,
        public b: FunctionValueGenerator | ValueGenerator
    ) {}

    startGen(memory: GeneratorMemory): void {
        this.a.startGen(memory);
        this.b.startGen(memory);
        this.indexCount = memory.length;
        memory.push(Math.random());
    }

    genValue(memory: GeneratorMemory, t = 0): number {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        const a = evalGenerator(this.a, memory, t);
        const b = evalGenerator(this.b, memory, t);
        return MathUtils.lerp(a, b, memory[this.indexCount]);
    }

    refreshTable(): void {
        this.a.refreshTable?.();
        this.b.refreshTable?.();
    }

    toJSON(): FunctionJSON {
        return {
            type: 'RandomBetweenCurves',
            a: this.a.toJSON(),
            b: this.b.toJSON(),
        };
    }

    static fromJSON(json: FunctionJSON): RandomBetweenCurves {
        return new RandomBetweenCurves(ValueGeneratorFromJSON(json.a), ValueGeneratorFromJSON(json.b));
    }

    clone(): FunctionValueGenerator {
        return new RandomBetweenCurves(this.a.clone(), this.b.clone());
    }
}

function evalGenerator(g: FunctionValueGenerator | ValueGenerator, memory: GeneratorMemory, t: number): number {
    if (g.type === 'function') {
        return (g as FunctionValueGenerator).genValue(memory, t);
    }
    return (g as ValueGenerator).genValue(memory);
}

/** Used by callers that need to know both children are beziers (optional). */
export function isRandomBetweenBezierCurves(g: FunctionValueGenerator | ValueGenerator): boolean {
    return g instanceof RandomBetweenCurves && g.a instanceof PiecewiseBezier && g.b instanceof PiecewiseBezier;
}
