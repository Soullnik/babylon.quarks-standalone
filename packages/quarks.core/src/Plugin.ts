import {BehaviorPlugin, BehaviorTypes} from './behaviors';
import {EmitterShapePlugin, EmitterShapes} from './shape';

/**
 * A set of emitter shapes and behaviors to register with {@link loadPlugin}, so effect files can
 * name them.
 */
export interface Plugin {
    /** Identifies the plugin; loading a plugin with an id already loaded does nothing. */
    id: string;
    /** Called once when the plugin is loaded, before its types are registered. */
    initialize: () => void;
    /** The emitter shapes the plugin adds. */
    emitterShapes: Array<EmitterShapePlugin>;
    /** The behaviors the plugin adds. */
    behaviors: Array<BehaviorPlugin>;
}

/** The plugins loaded, in load order. */
export const Plugins: Array<Plugin> = [];

/**
 * Registers a plugin's emitter shapes and behaviors, so effect files can name them. Loading the
 * same plugin id again does nothing. A type another plugin registered first keeps that plugin's.
 */
export function loadPlugin(plugin: Plugin) {
    const existing = Plugins.find((item) => item.id === plugin.id);
    if (!existing) {
        plugin.initialize();
        Plugins.push(plugin);
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
