import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import type {Scene} from '@babylonjs/core/scene';
import {ColorOverLife, ColorRange, type FunctionColorGenerator, Gradient} from 'babylon.quarks';

export const SHARED_ASSETS = {
    atlas: 'textures/texture1.png',
    atlasSecondary: 'textures/texture2.png',
    defaultParticle: 'textures/particle_default.png',
    smoke: 'textures/cfxr smoke cloud x4.png',
    sequenceText: 'textures/text_texture.png',
    sequenceLogo: 'textures/logo_texture.png',
};

/** ColorOverLife helper: ColorRange is a value generator but typed as function-only in quarks.core. */
export function createColorOverLifeRange(start: Color4, end: Color4) {
    return new ColorOverLife(new ColorRange(start, end) as unknown as FunctionColorGenerator);
}

/** ColorOverLife that fades every particle from `start` at birth to `end` at death, like Unity's gradient. */
export function createColorOverLifeGradient(start: Color4, end: Color4) {
    return new ColorOverLife(
        new Gradient(
            [
                [new Color3(start.r, start.g, start.b), 0],
                [new Color3(end.r, end.g, end.b), 1],
            ],
            [
                [start.a, 0],
                [end.a, 1],
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
