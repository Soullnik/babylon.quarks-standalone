import type {DemoContext} from "../types";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem} from "babylon.quarks";
import {makeCharacterBillboard} from "../shared/characterBillboard";

const REFRESH_TIME = 1.2;

/**
 * Repro harness for the "opaque wall always occludes particles regardless of
 * true depth" report. A plain opaque StandardMaterial box occluded correctly
 * (confirmed) — this variant swaps the box for the actual in-game occluder:
 * an alpha-cut-out character billboard (StandardMaterial +
 * useAlphaFromDiffuseTexture, same as the real character placeholder). That
 * flag makes Babylon treat the mesh as transparent instead of opaque, which
 * is the suspected difference from the box test.
 */
export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(2.5, 2, 3));
    camera.setTarget(new BVector3(0, 0.8, 0));

    const characterBase = new BVector3(0, 0, 0);
    const character = makeCharacterBillboard("occluderCharacter", scene, new Color3(0.6, 0.6, 0.65));
    character.position.x = characterBase.x;
    character.position.z = characterBase.z;

    const emitterPoint = new BVector3(characterBase.x, 0.9, characterBase.z);

    const loader = new QuarksLoader(scene, {baseUrl: ""});
    const root = await loader.load("gunFireBlue.json");
    root.parent = batchRenderer;
    // Emitter sits at roughly chest height on the character, same idea as the
    // wall test: some particles should end up nearer the camera than the
    // character and render on top of it, others farther and get hidden.
    root.position = emitterPoint.clone();

    const trackedSystems: ParticleSystem[] = [];
    QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
        const system = emitter.system as ParticleSystem;
        system.looping = false;
        batchRenderer.addSystem(system);
        systems.push(system);
        trackedSystems.push(system);
    });
    QuarksUtil.restart(root);
    QuarksUtil.play(root);

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
