import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import type {DemoControls} from '../types';

/** One topic of a feature demo: what it builds under its own node, shown alone. */
export interface Topic {
    name: string;
    build(group: TransformNode): void;
}

/**
 * Builds every topic under a node of its own and shows one at a time, picked on the viewer's bar
 * of topic tabs (the first to start with). A hidden topic's systems are disabled with its node:
 * frozen, not drawn.
 */
export function showTopics(scene: Scene, controls: DemoControls, topics: readonly Topic[]): void {
    const groups = topics.map((topic) => {
        const group = new TransformNode(topic.name, scene);
        topic.build(group);
        return group;
    });
    const show = (name: string) => {
        for (const group of groups) {
            group.setEnabled(group.name === name);
        }
    };
    show(topics[0].name);
    controls.topics(
        topics.map((topic) => topic.name),
        topics[0].name,
        show
    );
}
