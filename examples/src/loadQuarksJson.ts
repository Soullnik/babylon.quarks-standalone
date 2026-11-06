import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {getPhysicsResolver, QuarksLoader, QuarksUtil, setPhysicsResolver} from 'babylon.quarks';
import type {DemoContext, DemoRun} from './types';

/** Returns true when JSON looks like a Quarks / Three.js Object3D export. */
export function isQuarksExportJson(json: unknown): json is Record<string, unknown> {
    return typeof json === 'object' && json !== null && 'object' in json;
}

/** Seconds between replays of a dropped effect's one-shot systems. */
const REPLAY_PERIOD = 2;

/**
 * Loads a dropped Quarks JSON into the viewer's scene and plays it. While it runs, a ground plane
 * at y = 0 is the collider of its ApplyCollision behaviours, as in the editor, unless the page
 * already has a resolver; leaving the effect puts the previous one back.
 */
export function playQuarksJson(ctx: DemoContext, json: unknown, baseUrl = ''): DemoRun {
    if (!isQuarksExportJson(json)) {
        throw new Error('JSON must be a Quarks export with an "object" root (Object3D.toJSON format).');
    }
    const previous = getPhysicsResolver();
    if (!previous) {
        setPhysicsResolver({
            resolve(position: {y: number}, normal: {set: (x: number, y: number, z: number) => unknown}): boolean {
                if (position.y <= 0) {
                    normal.set(0, 1, 0);
                    return true;
                }
                return false;
            },
        } as never);
    }
    const root: TransformNode = new QuarksLoader(ctx.scene, {baseUrl}).parse(json, baseUrl);
    root.parent = ctx.batchRenderer;
    ctx.addEffect(root);
    QuarksUtil.restart(root);
    QuarksUtil.play(root);

    let elapsed = 0;
    return {
        update(delta) {
            elapsed += delta;
            if (elapsed < REPLAY_PERIOD) {
                return;
            }
            elapsed = 0;
            for (const system of ctx.systems) {
                if (!system.looping) {
                    system.restart();
                    system.play();
                }
            }
        },
        dispose() {
            setPhysicsResolver(previous);
        },
    };
}
