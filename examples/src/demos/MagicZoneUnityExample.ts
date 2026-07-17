import type {DemoContext} from "../types";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {CreateGround} from "@babylonjs/core/Meshes/Builders/groundBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem} from "babylon.quarks";

/**
 * Unity euler-order investigation harness (MagicZone).
 *
 * LEFT — the JSON exactly as unity-quark-exporter produced it: startRotation
 * Euler with order "XYZ". Unity composes 3D rotation around WORLD axes in
 * Z->X->Y order, so its X=90° flip + random Y spins the flat rune ring IN ITS
 * OWN PLANE. Interpreted as intrinsic XYZ, the same angles tilt every spawned
 * ring/glow quad OUT of plane by a random amount — the ring wobbles and the
 * pulsing glow reads as harsh blinking (each crossfading quad is oriented
 * differently, so the swap is visible).
 *
 * RIGHT — same JSON with two data fixes:
 *   1. eulerOrder "XYZ" -> "YXZ" (Unity's world-order Z->X->Y equals intrinsic
 *      Y->X->Z), so the random Y becomes an in-plane spin again;
 *   2. GlowCircle's angleZ interval [2π, 0] (a mangled Unity CONSTANT 360°≡0°)
 *      -> constant 0, so overlapping glow quads are identically oriented and
 *      their crossfade becomes an invisible, smooth pulse.
 *
 * If the right side matches Unity, the exporter fix is: write eulerOrder "YXZ"
 * for 3D start rotations and export constant curves as ConstantValue, never as
 * reversed intervals.
 */
export async function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 9, 16));
    camera.setTarget(new BVector3(0, 0, 0));

    const loader = new QuarksLoader(scene, {baseUrl: ""});

    const mount = async (url: string, x: number) => {
        const root = await loader.load(url);
        root.position.x = x;
        root.parent = batchRenderer;
        // Register and start every system under the root.
        QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
            const system = emitter.system as ParticleSystem;
            batchRenderer.addSystem(system);
            systems.push(system);
        });
        QuarksUtil.restart(root);
        QuarksUtil.play(root);
        return root;
    };

    await mount("magicZoneUnityExample.json", 0);
}
