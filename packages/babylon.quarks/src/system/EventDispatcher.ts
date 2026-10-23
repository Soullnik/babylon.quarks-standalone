import type {ParticleSystemEvent, ParticleSystemEventType} from 'quarks.core';

type Listener = (event: ParticleSystemEvent) => void;

/**
 * The callbacks registered on a {@link ParticleSystem}, by event type.
 *
 * The lists are copied on write, not on fire: adding or removing a callback while an event is
 * being fired (a listener removing itself, say) changes the next firing and never the one in
 * progress, so every callback registered when the event fired is called once.
 */
export class EventDispatcher {
    private readonly listeners: {[event: string]: readonly Listener[]} = {};

    /** Registers `callback` for `event`. */
    add(event: ParticleSystemEventType, callback: Listener): void {
        this.listeners[event] = [...(this.listeners[event] ?? []), callback];
    }

    /** Drops every callback for `event`, or for every event when it is left out. */
    removeAll(event?: ParticleSystemEventType): void {
        if (event === undefined) {
            for (const key of Object.keys(this.listeners)) {
                delete this.listeners[key];
            }
            return;
        }
        delete this.listeners[event];
    }

    /** Drops one callback for `event`. */
    remove(event: ParticleSystemEventType, callback: Listener): void {
        const callbacks = this.listeners[event];
        if (callbacks === undefined) {
            return;
        }
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            this.listeners[event] = callbacks.filter((_, i) => i !== index);
        }
    }

    /** True when at least one callback is registered for the event type. */
    has(event: ParticleSystemEventType): boolean {
        const callbacks = this.listeners[event];
        return callbacks !== undefined && callbacks.length > 0;
    }

    /** Calls the callbacks registered for the event's type, in the order they were added. */
    fire(event: ParticleSystemEvent): void {
        // The list as it is now: a callback added or removed by a listener does not shift it.
        const callbacks = this.listeners[event.type];
        if (callbacks === undefined) {
            return;
        }
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](event);
        }
    }
}
