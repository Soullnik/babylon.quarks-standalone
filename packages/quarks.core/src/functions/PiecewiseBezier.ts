import {FunctionValueGenerator} from './ValueGenerator';
import {PiecewiseFunction} from './PiecewiseFunction';
import {Bezier} from './Bezier';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';

export class PiecewiseBezier extends PiecewiseFunction<Bezier> implements FunctionValueGenerator {
    // default linear bezier
    constructor(curves: Array<[Bezier, number]> = [[new Bezier(0, 1.0 / 3, (1.0 / 3) * 2, 1), 0]]) {
        super();
        this.type = 'function';
        this.functions = curves;
    }

    genValue(memory: GeneratorMemory, t = 0): number {
        const functions = this.functions;
        const count = functions.length;
        if (count === 0) {
            return 0;
        }
        const index = this.findFunction(t);
        if (index === -1) {
            // Clamp like Unity: before the first key use the first curve value, not zero.
            if (t < functions[0][1]) {
                return functions[0][0].genValue(0);
            }
            return functions[count - 1][0].genValue(1);
        }
        const startX = functions[index][1];
        const endX = index + 1 < count ? functions[index + 1][1] : 1;
        return functions[index][0].genValue((t - startX) / (endX - startX));
    }

    toSVG(length: number, segments: number) {
        if (segments < 1) return '';
        let result = ['M', 0, this.functions[0][0].p[0]].join(' ');
        for (let i = 1.0 / segments; i <= 1; i += 1.0 / segments) {
            result = [result, 'L', i * length, this.genValue(undefined as any, i)].join(' ');
        }
        return result;
    }

    type: 'function';

    toJSON(): FunctionJSON {
        return {
            type: 'PiecewiseBezier',
            functions: this.functions.map(([bezier, start]) => ({function: bezier.toJSON(), start: start})),
        };
    }

    static fromJSON(json: FunctionJSON): PiecewiseBezier {
        return new PiecewiseBezier(
            json.functions.map((piecewiseFunction: any) => [
                Bezier.fromJSON(piecewiseFunction.function),
                piecewiseFunction.start,
            ])
        );
    }

    clone(): FunctionValueGenerator {
        return new PiecewiseBezier(this.functions.map(([bezier, start]) => [bezier.clone(), start]));
    }

    startGen(memory: GeneratorMemory): void {}
}
