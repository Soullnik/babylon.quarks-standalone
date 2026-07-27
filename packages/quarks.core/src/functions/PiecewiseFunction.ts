export abstract class PiecewiseFunction<T> {
    public functions: Array<[T, number]>;

    protected constructor() {
        this.functions = new Array<[T, number]>();
    }

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

    getStartX(index: number) {
        return this.functions[index][1];
    }
    setStartX(index: number, x: number) {
        if (index > 0) this.functions[index][1] = x;
    }
    getEndX(index: number) {
        if (index + 1 < this.functions.length) return this.functions[index + 1][1];
        return 1;
    }
    setEndX(index: number, x: number) {
        if (index + 1 < this.functions.length) this.functions[index + 1][1] = x;
    }

    insertFunction(t: number, func: T): void {
        const index = this.findFunction(t);
        this.functions.splice(index + 1, 0, [func, t]);
    }

    removeFunction(index: number): T {
        return this.functions.splice(index, 1)[0][0];
    }

    getFunction(index: number) {
        return this.functions[index][0];
    }

    setFunction(index: number, func: T) {
        this.functions[index][0] = func;
    }

    get numOfFunctions() {
        return this.functions.length;
    }
}
