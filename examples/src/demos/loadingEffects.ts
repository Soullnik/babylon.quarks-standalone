import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {QuarksLoader, QuarksUtil, serializeEffect} from 'babylon.quarks';
import {addCaption, addStatus} from '../shared/labels';
import {arcaneSwirl} from '../shared/sampleEffects';
import {addGround} from '../shared/stage';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext} from '../types';

const FLOOR = -2.6;
const FILES = ['ember-burst', 'frost-ring', 'arcane-swirl'];

/**
 * Effects as files, one topic at a time (picked in the panel), each labelled in the scene. The
 * files in `examples/public/effects/` are written by `scripts/write-sample-effects.mts` from
 * `shared/sampleEffects.ts`, as an editor or the Unity exporter would write them.
 *
 * - Load files: three effect files loaded together by `QuarksLoader.loadAll`, which fetches them
 *   in parallel and shares the textures they have in common.
 * - Round trip: an effect built in code, and beside it the same effect saved with
 *   `serializeEffect` and loaded back from that JSON with `loadFromJSON`.
 * - Copies: one loaded effect and copies of it made with `QuarksUtil.instantiate`, which share its
 *   textures and so draw from the same batches.
 */
export async function init({scene, camera, addEffect, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 2.4, 12.5));
    camera.setTarget(new BVector3(0, 0, 0));
    addGround(scene, FLOOR);
    const loader = new QuarksLoader(scene);

    let loadedCount = 0;
    const files = await loader.loadAll(
        FILES.map((name) => `effects/${name}.json`),
        {onProgress: (done) => (loadedCount = done)}
    );

    // Built in code, saved, and loaded back from what was saved.
    const built = arcaneSwirl(scene);
    const saved = serializeEffect(built);
    const savedText = JSON.stringify(saved);
    const reloaded = await loader.loadFromJSON(saved);

    // One more copy of a file for the copies to be made from.
    const original = await loader.load('effects/frost-ring.json');

    const place = (root: TransformNode, group: TransformNode, x: number, y = -0.6, z = 0) => {
        root.parent = group;
        root.position.set(x, y, z);
        addEffect(root);
        QuarksUtil.restart(root);
        QuarksUtil.play(root);
    };

    const topics: Topic[] = [
        {
            name: 'Load files',
            build(group) {
                files.forEach((root, index) => {
                    const x = (index - 1) * 4.6;
                    place(root, group, x, index === 1 ? FLOOR : -0.6);
                    addCaption(scene, group, x, root.name, `effects/${FILES[index]}.json`);
                });
                addStatus(
                    scene,
                    group,
                    new BVector3(0, -2.5, 3.5)
                )(`loader.loadAll(3 files): ${loadedCount} of ${files.length} loaded`);
            },
        },
        {
            name: 'Round trip',
            build(group) {
                place(built, group, -3.4);
                place(reloaded, group, 3.4);
                addCaption(scene, group, -3.4, 'Built in code', 'arcaneSwirl(scene)');
                addCaption(scene, group, 3.4, 'Saved and loaded back', 'serializeEffect → loadFromJSON');
                const systems = saved.object.children?.length ?? 0;
                addStatus(
                    scene,
                    group,
                    new BVector3(0, -2.5, 3.5)
                )(`JSON: ${systems} systems, ${(savedText.length / 1024).toFixed(1)} kB`);
            },
        },
        {
            name: 'Copies',
            build(group) {
                // The loaded effect at the centre, copies in a ring round it on the floor.
                place(original, group, 0, FLOOR, 0);
                const count = 6;
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2;
                    const copy = QuarksUtil.instantiate(original, `Frost ring ${i + 1}`);
                    place(copy, group, Math.cos(angle) * 4.2, FLOOR, Math.sin(angle) * 2.6);
                }
                addCaption(scene, group, 0, 'One file, seven rings', `QuarksUtil.instantiate × ${count}`);
            },
        },
    ];
    showTopics(scene, controls, topics);
}
