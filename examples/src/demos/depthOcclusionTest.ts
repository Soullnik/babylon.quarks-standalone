import type {DemoContext} from "../types";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {CreatePlane} from "@babylonjs/core/Meshes/Builders/planeBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem} from "babylon.quarks";
import {makeCharacterBillboard} from "../shared/characterBillboard";

const REFRESH_TIME = 1.2;
const OCCLUDER_SPACING = 2;
const EMITTER_HEIGHT = 0.9;

/**
 * Side-by-side occlusion comparison: the SAME effect (GunFirePurple, exported
 * without depthWrite) fired at chest height in front of two different
 * occluders — a plain opaque plane on the left and the real in-game
 * alpha-cutout character billboard on the right — so their rendering can be
 * compared directly under identical particle settings.
 */
export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.6, 5));
    camera.setTarget(new BVector3(0, 0.9, 0));

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
