/** @jest-environment jsdom */
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {ensurePortableTextureUrl} from '../src/core/textureExport';
import {useScene} from './helpers';

describe('portable texture urls', () => {
    const scene = useScene();

    const textureWith = (url: string, pixels: unknown, width = 1, height = 1) => {
        const texture = new Texture(null, scene.get());
        texture.url = url;
        jest.spyOn(texture, 'getSize').mockReturnValue({width, height});
        jest.spyOn(texture, 'readPixels').mockResolvedValue(pixels as never);
        return texture;
    };

    it('leaves fetchable and real data urls alone', async () => {
        for (const url of ['https://x/a.png', 'data:image/png;base64,AAAA', 'blob:x']) {
            const texture = textureWith(url, new Uint8Array(4));
            await ensurePortableTextureUrl(texture);
            expect(texture.url).toBe(url);
            expect(texture.readPixels).not.toHaveBeenCalled();
        }
    });

    it('bakes a glTF placeholder url into a png data uri once', async () => {
        const toDataURL = jest.fn(() => 'data:image/png;base64,BAKED');
        const putImageData = jest.fn();
        jest.spyOn(document, 'createElement').mockImplementation(
            () => ({getContext: () => ({putImageData}), toDataURL}) as unknown as HTMLCanvasElement
        );
        (globalThis as {ImageData?: unknown}).ImageData = class {
            constructor(
                public data: Uint8ClampedArray,
                public width: number,
                public height: number
            ) {}
        };
        const texture = textureWith('data:leave.glb#image0', new Uint8Array([1, 2, 3, 4]));
        await ensurePortableTextureUrl(texture);
        expect(texture.url).toBe('data:image/png;base64,BAKED');
        expect(putImageData).toHaveBeenCalledTimes(1);
        texture.url = 'data:leave.glb#image0';
        await ensurePortableTextureUrl(texture);
        expect(texture.url).toBe('data:image/png;base64,BAKED');
        expect(toDataURL).toHaveBeenCalledTimes(1);
        (document.createElement as jest.Mock).mockRestore();
    });

    it('gives up on an empty texture, odd pixel data or no 2d context', async () => {
        const empty = textureWith('data:x.glb#image0', new Uint8Array(0), 0, 0);
        await ensurePortableTextureUrl(empty);
        expect(empty.url).toBe('data:x.glb#image0');
        const floats = textureWith('data:y.glb#image0', new Float32Array(4));
        await ensurePortableTextureUrl(floats);
        expect(floats.url).toBe('data:y.glb#image0');
        jest.spyOn(document, 'createElement').mockImplementation(
            () => ({getContext: () => null}) as unknown as HTMLCanvasElement
        );
        const noContext = textureWith('data:z.glb#image0', new Uint8Array(4));
        await ensurePortableTextureUrl(noContext);
        expect(noContext.url).toBe('data:z.glb#image0');
        (document.createElement as jest.Mock).mockRestore();
    });
});
