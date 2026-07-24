import type {DemoContext} from "../types";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {CreateBox} from "@babylonjs/core/Meshes/Builders/boxBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem} from "babylon.quarks";

const REFRESH_TIME = 1.2;

/**
 * Repro harness for the "opaque wall always occludes particles regardless of
 * true depth" report: a Unity-authored effect (GunFireBlue) fired next to an
 * opaque vertical wall, mirroring the Unity scene the bug was first seen in.
 * The burst is brief (~0.2-0.35s life) and re-fires every REFRESH_TIME so it
 * can be watched repeatedly.
 */
export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(2.5, 2, 3));
    camera.setTarget(new BVector3(0, 0.6, 0));

    const wall = CreateBox("occluderWall", {width: 2, height: 2.5, depth: 0.15}, scene);
    const wallMat = new StandardMaterial("occluderWallMat", scene);
    wallMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
    wallMat.specularColor = new Color3(0, 0, 0);
    wall.material = wallMat;
    wall.position = new BVector3(0, 0.8, 0);

    const loader = new QuarksLoader(scene, {baseUrl: ""});
    const root = await loader.load("gunFireBlue.json");
    root.parent = batchRenderer;

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
