import {copyPrefix, copyRange, PrefixViews, UPLOAD_CHUNK} from '../src/prefixViews';

describe('PrefixViews', () => {
    it('gives a view at least as long as asked, in whole chunks, from the start of the buffer', () => {
        const buffer = new Float32Array(1000);
        const views = new PrefixViews(256);
        for (const length of [1, 255, 256, 257, 700]) {
            const view = views.of(buffer, length);
            expect(view.length).toBeGreaterThanOrEqual(length);
            expect(view.length % 256).toBe(0);
            expect(view.buffer).toBe(buffer.buffer);
            expect(view.byteOffset).toBe(0);
        }
    });

    it('gives the whole buffer when a whole chunk would run past it', () => {
        const buffer = new Float32Array(300);
        expect(new PrefixViews(256).of(buffer, 280)).toBe(buffer);
    });

    it('keeps each view, so a steady frame makes none', () => {
        const buffer = new Float32Array(1000);
        const views = new PrefixViews();
        const first = views.of(buffer, 10);
        expect(views.of(buffer, 20)).toBe(first);
        expect(views.of(buffer, UPLOAD_CHUNK + 1)).not.toBe(first);
        expect(views.of(buffer, 30)).toBe(first);
    });

    it('lets go of the views of a buffer that was replaced', () => {
        const views = new PrefixViews(4);
        const old = new Float32Array(16);
        const grown = new Float32Array(32);
        views.of(old, 3);
        const view = views.of(grown, 3);
        expect(view.buffer).toBe(grown.buffer);
        expect(views.of(old, 3).buffer).toBe(old.buffer);
    });

    it('works on index buffers', () => {
        const indices = new Uint32Array(600);
        const view = new PrefixViews<Uint32Array>().of(indices, 6);
        expect(view).toBeInstanceOf(Uint32Array);
        expect(view.length).toBe(UPLOAD_CHUNK);
    });
});

describe('copyPrefix and copyRange', () => {
    const source = Float32Array.from({length: 12}, (_, i) => i + 0.5);

    it('copy what set with a subarray copies', () => {
        for (const [begin, end, offset] of [
            [0, 5, 0],
            [0, 12, 3],
            [4, 9, 2],
            [3, 3, 0],
        ]) {
            const expected = new Float32Array(20).fill(-1);
            expected.set(source.subarray(begin, end), offset);
            const actual = new Float32Array(20).fill(-1);
            copyRange(actual, offset, source, begin, end);
            expect(actual).toEqual(expected);
        }
        const expected = new Float32Array(20).fill(-1);
        expected.set(source.subarray(0, 7), 5);
        const actual = new Float32Array(20).fill(-1);
        copyPrefix(actual, 5, source, 7);
        expect(actual).toEqual(expected);
    });
});
