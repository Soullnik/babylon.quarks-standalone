import type {ParticleSystem} from 'babylon.quarks';

export type EditorListener = () => void;

/**
 * Headless edit-model over a live ParticleSystem: mutate through apply() so every
 * change notifies subscribers (React UI, save indicators, hosts like BabylonJS Editor).
 */
export class EffectBinding {
    readonly system: ParticleSystem;
    /** Systems spawned by sub-emitter behaviors; serialized as children of the root emitter. */
    readonly subSystems: ParticleSystem[] = [];
    private listeners = new Set<EditorListener>();
    private revision = 0;

    constructor(system: ParticleSystem, subSystems: ParticleSystem[] = []) {
        this.system = system;
        this.subSystems.push(...subSystems);
    }

    subscribe(listener: EditorListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Monotonic change counter, usable as a React external-store snapshot. */
    getRevision(): number {
        return this.revision;
    }

    apply(mutate: (system: ParticleSystem) => void): void {
        mutate(this.system);
        this.notify();
    }

    addSubSystem(sub: ParticleSystem): void {
        this.subSystems.push(sub);
        this.notify();
    }

    removeSubSystem(sub: ParticleSystem): void {
        const index = this.subSystems.indexOf(sub);
        if (index >= 0) {
            this.subSystems.splice(index, 1);
        }
        this.notify();
    }

    private notify(): void {
        this.revision++;
        for (const listener of this.listeners) {
            listener();
        }
    }

    restart(): void {
        this.system.restart();
        this.system.play();
        for (const sub of this.subSystems) {
            sub.restart();
        }
    }

    /**
     * Serializes the effect into the Quarks JSON envelope understood by QuarksLoader
     * (three.js Object3D export shape with a ParticleEmitter root).
     */
    exportJSON(name = 'effect'): string {
        const meta: {
            textures: {[k: string]: unknown};
            materials: {[k: string]: {[key: string]: unknown}};
            geometries: {[k: string]: unknown};
        } = {textures: {}, materials: {}, geometries: {}};
        const ps = this.system.toJSON(meta as never, {useUrlForImage: true} as never);
        const children = this.subSystems.map((sub, index) => ({
            uuid: (sub.emitter as {uuid?: string}).uuid ?? `${name}-sub-${index}`,
            type: 'ParticleEmitter',
            name: sub.emitter.name || `${name}-sub-${index}`,
            layers: 1,
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            ps: sub.toJSON(meta as never, {useUrlForImage: true} as never),
        }));

        // toJSON stores live Texture instances and material refs in meta; flatten them
        // into the serializable images/textures/materials arrays QuarksLoader expects.
        const images: Array<{uuid: string; url: string}> = [];
        const textures: Array<{uuid: string; image?: string}> = [];
        for (const [uuid, value] of Object.entries(meta.textures)) {
            const texture = value as {url?: string; name?: string} | null;
            const url = texture?.url ?? texture?.name;
            if (url) {
                const imageUuid = `${uuid}-image`;
                images.push({uuid: imageUuid, url});
                textures.push({uuid, image: imageUuid});
            } else {
                textures.push({uuid});
            }
        }
        const materials = Object.values(meta.materials).map((material) => {
            const {sourceMaterial: _sourceMaterial, ...serializable} = material;
            return serializable;
        });

        return JSON.stringify(
            {
                metadata: {version: 4.5, type: 'Object3D', generator: 'babylon.quarks-editor'},
                geometries: Object.values(meta.geometries),
                materials,
                textures,
                images,
                object: {
                    uuid: `${name}-emitter`,
                    type: 'ParticleEmitter',
                    name,
                    layers: 1,
                    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                    ps,
                    children: children.length > 0 ? children : undefined,
                },
            },
            null,
            2
        );
    }
}
