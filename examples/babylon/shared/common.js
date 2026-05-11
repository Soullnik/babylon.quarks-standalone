import {Texture} from '@babylonjs/core/Materials/Textures/texture';

export const SHARED_ASSETS = {
    atlas: 'textures/texture1.png',
    defaultParticle: 'textures/particle_default.png',
    smoke: 'textures/cfxr smoke cloud x4.png',
    sequenceText: 'textures/text_texture.png',
    sequenceLogo: 'textures/logo_texture.png',
};

export function createSharedTexture(scene, path = SHARED_ASSETS.atlas) {
    const texture = new Texture(path, scene);
    // Match three.js defaults used by examples: clamp sampling on sprite atlases.
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}
