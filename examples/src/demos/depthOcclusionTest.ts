import type {DemoContext} from "../types";
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {CreatePlane} from "@babylonjs/core/Meshes/Builders/planeBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem} from "babylon.quarks";
import {makeCharacterBillboard} from "../shared/characterBillboard";

const REFRESH_TIME = 1.2;
const OCCLUDER_SPACING = 2;
const EMITTER_HEIGHT = 0.9;
// World-unit band, ending right at the occluder's own depth, over which a
// soft particle fades out instead of being hard-clipped by the depth test.
const SOFT_NEAR_FADE = 0;
const SOFT_FAR_FADE = 0.3;

/**
 * Side-by-side occlusion comparison: the SAME effect (GunFirePurple, exported
 * without depthWrite) fired at chest height in front of two different
 * occluders — a plain opaque plane on the left and the real in-game
 * alpha-cutout character billboard on the right — so their rendering can be
 * compared directly under identical particle settings.
 *
 * Both particle systems have softParticles enabled: instead of the alpha-test
 * occluder's depth hard-clipping the particle exactly at its silhouette edge,
 * the particle fades smoothly over SOFT_FAR_FADE world units as it nears the
 * occluder's depth (sampled from a scene depth texture), removing the sharp
 * cutoff line while keeping the occluder's correct opaque-pass sorting.
 */
export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.6, 5));
    camera.setTarget(new BVector3(0, 0.9, 0));

    if (typeof scene.enableDepthRenderer === 'function') {
        const depthRenderer = scene.enableDepthRenderer();
        batchRenderer.setDepthTexture(depthRenderer.getDepthMap());
    }

    const planeX = -OCCLUDER_SPACING / 2;
    const characterX = OCCLUDER_SPACING / 2;

    const plane = CreatePlane("occluderPlane", {width: 1.2, height: 1.8}, scene);
    plane.position = new BVector3(planeX, 0.9, 0);
    const planeMat = new StandardMaterial("occluderPlaneMat", scene);
    planeMat.diffuseColor = new Color3(0.6, 0.6, 0.65);
    planeMat.specularColor = new Color3(0, 0, 0);
    planeMat.backFaceCulling = false;
    plane.material = planeMat;

    const character = makeCharacterBillboard("occluderCharacter", scene, new Color3(0.6, 0.6, 0.65));
    character.position.x = characterX;
    character.position.z = 0;

    const trackedSystems: ParticleSystem[] = [];

    const mountEffect = async (x: number) => {
        const loader = new QuarksLoader(scene, {baseUrl: ""});
        const root = await loader.load("GunFirePurple.json");
        root.parent = batchRenderer;
        root.position = new BVector3(x, EMITTER_HEIGHT, 0);
        QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
            const system = emitter.system as ParticleSystem;
            system.looping = false;
            system.rendererSettings.softParticles = true;
            system.rendererSettings.softNearFade = SOFT_NEAR_FADE;
            system.rendererSettings.softFarFade = SOFT_FAR_FADE;
            batchRenderer.addSystem(system);
            systems.push(system);
            trackedSystems.push(system);
        });
        QuarksUtil.restart(root);
        QuarksUtil.play(root);
    };

    await Promise.all([mountEffect(planeX), mountEffect(characterX)]);

    demoState.explosion = {elapsed: 0, systems: trackedSystems};
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.explosion;
    if (!state?.systems?.length) {
        return;
    }
    state.elapsed += delta;
    if (state.elapsed >= REFRESH_TIME) {
        state.elapsed = 0;
        for (const system of state.systems) {
            system.restart();
            system.play();
        }
    }
}
