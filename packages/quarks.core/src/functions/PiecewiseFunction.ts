/**
 * A function over [0, 1] made of pieces, each a function of type `T` with the x it starts at; a
 * piece runs to the next one's start, the last to 1.
 */
export abstract class PiecewiseFunction<T> {
    /** The pieces as `[function, startX]`, sorted by start; the first starts at 0. */
    public functions: Array<[T, number]>;

    protected constructor() {
        this.functions = new Array<[T, number]>();
    }

    /**
     * The index of the piece `t` falls in, or -1 when `t` is outside [0, 1] or there are no pieces.
     */
    findFunction(t: number): number {
        const functions = this.functions;
        const last = functions.length - 1;
        // Single-curve piecewise functions are the common case (one bezier over
        // the whole [0, 1] range); resolve them without running the search.
        if (last <= 0) {
            return last === 0 && t >= functions[0][1] && t <= 1 ? 0 : -1;
        }
        let left = 0,
            right = last;
        while (left + 1 < right) {
            const mid = (left + right) >> 1;
            if (t < functions[mid][1]) right = mid - 1;
            else if (t > this.getEndX(mid)) left = mid + 1;
            else return mid;
        }
        for (let i = left; i <= right; i++) {
            if (t >= functions[i][1] && t <= this.getEndX(i)) return i;
        }
        return -1;
    }

    /** The x where piece `index` starts. */
    getStartX(index: number) {
        return this.functions[index][1];
    }
    /**
     * Moves the start of piece `index`; the first piece always starts at 0, so index 0 is ignored.
     */
    setStartX(index: number, x: number) {
        if (index > 0) this.functions[index][1] = x;
    }
    /** The x where piece `index` ends: the next piece's start, or 1 for the last. */
    getEndX(index: number) {
        if (index + 1 < this.functions.length) return this.functions[index + 1][1];
        return 1;
    }
    /**
     * Moves the end of piece `index`, the next piece's start; the last piece always ends at 1, so
     * it is ignored there.
     */
    setEndX(index: number, x: number) {
        if (index + 1 < this.functions.length) this.functions[index + 1][1] = x;
    }

    /** Inserts `func` as a piece starting at `t`, after the piece `t` falls in. */
    insertFunction(t: number, func: T): void {
        const index = this.findFunction(t);
        this.functions.splice(index + 1, 0, [func, t]);
    }

    /**
     * Removes piece `index`.
     * @returns Its function.
     */
    removeFunction(index: number): T {
        return this.functions.splice(index, 1)[0][0];
    }

    /** The function of piece `index`. */
    getFunction(index: number) {
        return this.functions[index][0];
    }

    /** Replaces the function of piece `index`. */
    setFunction(index: number, func: T) {
        this.functions[index][0] = func;
    }

    /** How many pieces there are. */
    get numOfFunctions() {
        return this.functions.length;
    }
}
