import type {ParticleSystemEvent, ParticleSystemEventType} from 'quarks.core';

type Listener = (event: ParticleSystemEvent) => void;

/** The callbacks registered on a {@link ParticleSystem}, by event type. */
export class EventDispatcher {
    private readonly listeners: {[event: string]: Listener[]} = {};

    /** Registers `callback` for `event`. */
    add(event: ParticleSystemEventType, callback: Listener): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /** Drops every callback for `event`. */
    removeAll(event: ParticleSystemEventType): void {
        if (this.listeners[event]) this.listeners[event] = [];
    }

    /** Drops one callback for `event`. */
    remove(event: ParticleSystemEventType, callback: Listener): void {
        if (this.listeners[event]) {
            const index = this.listeners[event].indexOf(callback);
            if (index !== -1) this.listeners[event].splice(index, 1);
        }
    }

    /** True when at least one callback is registered for the event type. */
    has(event: ParticleSystemEventType): boolean {
        const callbacks = this.listeners[event];
        return callbacks !== undefined && callbacks.length > 0;
    }

    /** Calls the callbacks registered for the event's type, in the order they were added. */
    fire(event: ParticleSystemEvent): void {
        const callbacks = this.listeners[event.type];
        if (callbacks === undefined) {
            return;
        }
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](event);
        }
    }
}
