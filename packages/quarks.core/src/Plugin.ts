import {BehaviorPlugin, BehaviorTypes} from './behaviors';
import {EmitterShapePlugin, EmitterShapes} from './shape';

export interface Plugin {
    id: string;
    initialize: () => void;
    emitterShapes: Array<EmitterShapePlugin>;
    behaviors: Array<BehaviorPlugin>;
}

export const Plugins: Array<Plugin> = [];

/**
 * Registers a plugin's emitter shapes and behaviors, so effect files can name them. Loading the
 * same plugin id again does nothing. A type another plugin registered first keeps that plugin's.
 */
export function loadPlugin(plugin: Plugin) {
    const existing = Plugins.find((item) => item.id === plugin.id);
    if (!existing) {
        Plugins.push(plugin);
        plugin.initialize();
        for (const emitterShape of plugin.emitterShapes) {
            if (!EmitterShapes[emitterShape.type]) {
                EmitterShapes[emitterShape.type] = emitterShape;
            }
        }
        for (const behavior of plugin.behaviors) {
            if (!BehaviorTypes[behavior.type]) {
                BehaviorTypes[behavior.type] = behavior;
            }
        }
    }
}

/** Removes a plugin and the types it registered; types another plugin registered stay. */
export function unloadPlugin(pluginId: string) {
    const index = Plugins.findIndex((item) => item.id === pluginId);
    if (index < 0) {
        return;
    }
    const plugin = Plugins[index];
    Plugins.splice(index, 1);
    for (const emitterShape of plugin.emitterShapes) {
        if (EmitterShapes[emitterShape.type] === emitterShape) {
            delete EmitterShapes[emitterShape.type];
        }
    }
    for (const behavior of plugin.behaviors) {
        if (BehaviorTypes[behavior.type] === behavior) {
            delete BehaviorTypes[behavior.type];
        }
    }
}
