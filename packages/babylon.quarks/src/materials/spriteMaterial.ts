import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4} from '@babylonjs/core/Maths/math.vector';
import {RenderMode, StoredBatchSettings} from '../VFXBatch';
import particle_vert from '../shaders/particle_vert.glsl';
import particle_frag from '../shaders/particle_frag.glsl';
import particle_physics_frag from '../shaders/particle_physics_frag.glsl';
import stretched_bb_particle_vert from '../shaders/stretched_bb_particle_vert.glsl';
import local_particle_physics_vert from '../shaders/local_particle_physics_vert.glsl';

/**
 * Builds the sprite ShaderMaterial for a batch settings snapshot. Shared by the
 * CPU SpriteBatch and the GPU sprite batch so both render paths stay identical.
 */
export function buildSpriteMaterial(settings: StoredBatchSettings, scene: Scene): ShaderMaterial {
    const shaderName = `quarksParticle_${settings.renderMode}_${Date.now()}`;
    let vertexShader: string;
    let fragmentShader: string;
    const defines: string[] = [];

    if (settings.renderMode === RenderMode.Mesh) {
        vertexShader = local_particle_physics_vert;
        fragmentShader = particle_physics_frag;
    } else if (settings.renderMode === RenderMode.StretchedBillBoard) {
        vertexShader = stretched_bb_particle_vert;
        fragmentShader = particle_frag;
    } else {
        vertexShader = particle_vert;
        fragmentShader = particle_frag;
    }

    if (settings.texture) {
        defines.push('USE_MAP');
    }
    if (settings.uTileCount > 1 || settings.vTileCount > 1) {
        defines.push('UV_TILE');
    }
    if (settings.blendTiles) {
        defines.push('TILE_BLEND');
    }
    if (settings.softParticles) {
        defines.push('SOFT_PARTICLES');
    }
    if (settings.materialAlphaTest > 0) {
        defines.push('USE_ALPHATEST');
    }
    if (settings.renderMode === RenderMode.VerticalBillBoard) {
        defines.push('VERTICAL');
    }
    if (settings.renderMode === RenderMode.HorizontalBillBoard) {
        defines.push('HORIZONTAL');
    }

    Effect.ShadersStore[shaderName + 'VertexShader'] = vertexShader;
    Effect.ShadersStore[shaderName + 'FragmentShader'] = fragmentShader;

    const attributes = ['position', 'uv', 'offset', 'color', 'size', 'rotation', 'uvTile'];
    if (settings.renderMode === RenderMode.Mesh) {
        attributes.push('normal');
    }
    if (settings.renderMode === RenderMode.StretchedBillBoard) {
        attributes.push('velocity');
    }

    const uniforms = ['world', 'view', 'projection', 'worldView', 'worldViewProjection'];
    const samplers: string[] = [];

    if (settings.uTileCount > 1 || settings.vTileCount > 1) {
        uniforms.push('tileCountX');
        uniforms.push('tileCountY');
    }
    if (settings.texture) {
        samplers.push('map');
    }
    if (settings.renderMode === RenderMode.StretchedBillBoard) {
        uniforms.push('speedFactor');
    }
    if (settings.softParticles) {
        uniforms.push('softParams');
        uniforms.push('projParams');
        samplers.push('depthTexture');
    }
    if (settings.materialAlphaTest > 0) {
        uniforms.push('alphaTest');
    }
    if (settings.renderMode === RenderMode.Mesh) {
        uniforms.push('lightDirection');
        uniforms.push('lightColor');
        uniforms.push('ambientColor');
    }

    const mat = new ShaderMaterial(shaderName, scene,
        {vertex: shaderName, fragment: shaderName},
        {
            attributes,
            uniforms,
            samplers,
            defines,
            needAlphaBlending: settings.materialTransparent,
        }
    );

    if (settings.texture) {
        mat.setTexture('map', settings.texture);
    }
    if (settings.uTileCount > 1 || settings.vTileCount > 1) {
        mat.setFloat('tileCountX', settings.uTileCount);
        mat.setFloat('tileCountY', settings.vTileCount);
    }
    if (settings.renderMode === RenderMode.StretchedBillBoard) {
        mat.setFloat('speedFactor', settings.softNearFade > 0 ? settings.softNearFade : 1.0);
    }
    if (settings.softParticles) {
        mat.setVector2('softParams', new BVector2(settings.softNearFade, 1.0 / Math.max(settings.softFarFade - settings.softNearFade, 0.0001)));
        mat.onBindObservable.add(() => {
            const camera = scene.activeCamera;
            if (camera) {
                mat.setVector4('projParams', new BVector4(camera.minZ, camera.maxZ, 0, 0));
            }
        });
    }
    if (settings.materialAlphaTest > 0) {
        mat.setFloat('alphaTest', settings.materialAlphaTest);
    }
    if (settings.renderMode === RenderMode.Mesh) {
        mat.setVector3('lightDirection', new BVector3(0.4, -1, 0.6));
        mat.setVector3('lightColor', new BVector3(1, 1, 1));
        mat.setVector3('ambientColor', new BVector3(0.35, 0.35, 0.35));
    }

    mat.backFaceCulling = false;

    if (settings.materialTransparent) {
        mat.alphaMode = settings.materialBlendMode;
    } else {
        mat.alphaMode = Constants.ALPHA_DISABLE;
    }
    mat.needDepthPrePass = settings.materialDepthWrite;
    mat.forceDepthWrite = settings.materialDepthWrite;
    mat.disableDepthWrite = !settings.materialDepthWrite;

    return mat;
}
