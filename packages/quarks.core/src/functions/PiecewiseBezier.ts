import {Bezier} from './Bezier';
import type {PiecewiseBezierJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {PiecewiseFunction} from './PiecewiseFunction';
import {FunctionValueGenerator} from './ValueGenerator';

/**
 * A curve made of cubic {@link Bezier} segments, each starting at its own time in [0, 1]: Unity's
 * animation curve. Sampled through a table of {@link PiecewiseBezier.TABLE_SIZE} values.
 */
export class PiecewiseBezier extends PiecewiseFunction<Bezier> implements FunctionValueGenerator {
    /** Sample count of the table built by {@link refreshTable}. */
    static readonly TABLE_SIZE = 257;

    // default linear bezier
    constructor(curves: Array<[Bezier, number]> = [[new Bezier(0, 1.0 / 3, (1.0 / 3) * 2, 1), 0]]) {
        super();
        this.type = 'function';
        this.functions = curves;
    }

    /**
     * Sampled copy of the curve, or null while none has been built.
     * See {@link refreshTable}.
     */
    private table: Float32Array | null = null;
    /**
     * Control points the table was built from, used to detect edits. Float64 on purpose: the
     * points are doubles, and a Float32Array rounds most of them (0.2, almost any exported value),
     * so the comparison never matched and the table was resampled on every call.
     */
    private tableSignature: Float64Array | null = null;

    /**
     * Rebuilds the sampled table when the curve changed, otherwise does nothing.
     *
     * Evaluating this curve means a piece lookup plus a cubic; a particle system
     * does that once per particle per frame. Sampling it once and interpolating
     * costs two loads and a lerp instead. Sampling error at
     * {@link PiecewiseBezier.TABLE_SIZE} points stays around 1e-5 for the shapes
     * a curve editor produces — far below what a colour or a size can show.
     *
     * The curve is public and mutable (a curve editor writes straight into
     * `functions` and a Bezier's `p`), so this compares the control points
     * against the ones the table was built from and only resamples on a real
     * change. That is a handful of float compares per frame.
     */
    refreshTable(): void {
        const functions = this.functions;
        const count = functions.length;
        if (count === 0) {
            this.table = null;
            this.tableSignature = null;
            return;
        }

        // signature: four control points plus the start position of each piece
        const signatureLength = count * 5;
        let signature = this.tableSignature;
        let changed = signature === null || signature.length !== signatureLength;
        if (changed) {
            signature = new Float64Array(signatureLength);
        }
        for (let i = 0, s = 0; i < count; i++, s += 5) {
            const p = functions[i][0].p;
            const start = functions[i][1];
            if (!changed) {
                changed =
                    signature![s] !== p[0] ||
                    signature![s + 1] !== p[1] ||
                    signature![s + 2] !== p[2] ||
                    signature![s + 3] !== p[3] ||
                    signature![s + 4] !== start;
            }
            if (changed) {
                signature![s] = p[0];
                signature![s + 1] = p[1];
                signature![s + 2] = p[2];
                signature![s + 3] = p[3];
                signature![s + 4] = start;
            }
        }
        if (!changed && this.table !== null) {
            return;
        }

        this.tableSignature = signature;
        const size = PiecewiseBezier.TABLE_SIZE;
        const table = this.table !== null && this.table.length === size ? this.table : new Float32Array(size);
        const step = 1 / (size - 1);
        for (let i = 0; i < size; i++) {
            table[i] = this.genValueExact(i * step);
        }
        this.table = table;
    }

    /**
     * The sampled table {@link genValue} currently reads from, or null while
     * none has been built. Lets a compiled behavior pass interpolate the table
     * inline instead of calling in here once per particle.
     */
    sampledTable(): Float32Array | null {
        return this.table;
    }

    /** Drops the sampled table, so later reads go back to evaluating the curve. */
    clearTable(): void {
        this.table = null;
        this.tableSignature = null;
    }

    /**
     * The curve's value at `t`, clamped to the ends outside [0, 1]: from the sampled table when
     * {@link PiecewiseBezier.refreshTable} has built one, from the curve otherwise.
     */
    genValue(memory: GeneratorMemory, t = 0): number {
        const table = this.table;
        if (table !== null) {
            const last = table.length - 1;
            if (t <= 0) {
                return table[0];
            }
            if (t >= 1) {
                return table[last];
            }
            const x = t * last;
            const index = x | 0;
            const fraction = x - index;
            const value = table[index];
            return value + (table[index + 1] - value) * fraction;
        }
        return this.genValueExact(t);
    }

    /** Evaluates the curve itself, ignoring any sampled table. */
    genValueExact(t: number): number {
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
        const span = endX - startX;
        // Adjacent curves can start at the same position; an empty span would
        // divide to NaN, so evaluate at the curve's start.
        return functions[index][0].genValue(span > 0 ? (t - startX) / span : 0);
    }

    /**
     * An SVG path `d` attribute drawing the curve over x in [0, `length`] with `segments` straight
     * segments; empty below one segment.
     */
    toSVG(length: number, segments: number) {
        if (segments < 1 || this.functions.length === 0) return '';
        let result = ['M', 0, this.functions[0][0].p[0]].join(' ');
        for (let i = 1.0 / segments; i <= 1; i += 1.0 / segments) {
            result = [result, 'L', i * length, this.genValueExact(i)].join(' ');
        }
        return result;
    }

    /** Always `'function'`. */
    type: 'function';

    /** The JSON form, `{type: 'PiecewiseBezier', functions: [{function, start}]}`. */
    toJSON(): PiecewiseBezierJSON {
        return {
            type: 'PiecewiseBezier',
            functions: this.functions.map(([bezier, start]) => ({function: bezier.toJSON(), start: start})),
        };
    }

    /** Reads {@link PiecewiseBezier.toJSON} output. */
    static fromJSON(json: PiecewiseBezierJSON): PiecewiseBezier {
        return new PiecewiseBezier(
            json.functions.map((piecewiseFunction): [Bezier, number] => [
                Bezier.fromJSON(piecewiseFunction.function),
                piecewiseFunction.start,
            ])
        );
    }

    /** A copy with its own pieces. */
    clone(): FunctionValueGenerator {
        return new PiecewiseBezier(this.functions.map(([bezier, start]) => [bezier.clone(), start]));
    }

    /** Does nothing: a curve rolls nothing. */
    startGen(memory: GeneratorMemory): void {}
}
