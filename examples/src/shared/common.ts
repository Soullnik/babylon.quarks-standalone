import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import {ColorOverLife, ColorRange, type FunctionColorGenerator, Gradient, Vector3, Vector4} from 'babylon.quarks';

export const SHARED_ASSETS = {
    atlas: 'textures/texture1.png',
    atlasSecondary: 'textures/texture2.png',
    defaultParticle: 'textures/particle_default.png',
    smoke: 'textures/cfxr smoke cloud x4.png',
    sequenceText: 'textures/text_texture.png',
    sequenceLogo: 'textures/logo_texture.png',
};

/** ColorOverLife helper: ColorRange is a value generator but typed as function-only in quarks.core. */
export function createColorOverLifeRange(start: Vector4, end: Vector4) {
    return new ColorOverLife(new ColorRange(start, end) as unknown as FunctionColorGenerator);
}

/** ColorOverLife that fades every particle from `start` at birth to `end` at death, like Unity's gradient. */
export function createColorOverLifeGradient(start: Vector4, end: Vector4) {
    return new ColorOverLife(
        new Gradient(
            [
                [new Vector3(start.x, start.y, start.z), 0],
                [new Vector3(end.x, end.y, end.z), 1],
            ],
            [
                [start.w, 0],
                [end.w, 1],
            ]
        )
    );
}

export function createSharedTexture(scene: Scene, path: string = SHARED_ASSETS.atlas) {
    const texture = new Texture(path, scene);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}
