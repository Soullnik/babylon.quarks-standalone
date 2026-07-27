import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, SerializationOptions} from 'quarks.core';

export class ParticleEmitter extends TransformNode {
    system: IParticleSystem;
    private _matrixWorld: Matrix4 = new Matrix4();
    private _matrixWorldFlag = -1;

    /**
     * The node's world matrix in quarks.core form. Mirrored from Babylon's
     * matrix only when that matrix actually changed (tracked by its
     * `updateFlag`), so repeated reads inside a frame are free.
     */
    get matrixWorld(): Matrix4 {
        const m = this.getWorldMatrix();
        const flag = m.updateFlag;
        if (flag === this._matrixWorldFlag) {
            return this._matrixWorld;
        }
        this._matrixWorldFlag = flag;
        const e = this._matrixWorld.elements;
        const s = m.m;
        e[0] = s[0];
        e[1] = s[1];
        e[2] = s[2];
        e[3] = s[3];
        e[4] = s[4];
        e[5] = s[5];
        e[6] = s[6];
        e[7] = s[7];
        e[8] = s[8];
        e[9] = s[9];
        e[10] = s[10];
        e[11] = s[11];
        e[12] = s[12];
        e[13] = s[13];
        e[14] = s[14];
        e[15] = s[15];
        return this._matrixWorld;
    }

    get visible(): boolean {
        return this.isEnabled();
    }

    set visible(value: boolean) {
        this.setEnabled(value);
    }

    get uuid(): string {
        return this.uniqueId.toString();
    }

    constructor(system: IParticleSystem, scene?: Scene) {
        super('particleEmitter', scene || undefined);
        this.system = system;
    }

    dispose(): void {
        super.dispose();
    }

    extractFromCache(cache: any): any[] {
        const values: any[] = [];
        for (const key in cache) {
            const data = cache[key];
            if (data && typeof data === 'object') {
                delete data.metadata;
            }
            values.push(data);
        }
        return values;
    }

    clone(name?: string): ParticleEmitter {
        const clonedSystem = this.system.clone();
        const clonedEmitter = clonedSystem.emitter as ParticleEmitter;
        clonedEmitter.name = name ?? this.name;
        clonedEmitter.position.copyFrom(this.position);
        clonedEmitter.rotation.copyFrom(this.rotation);
        clonedEmitter.scaling.copyFrom(this.scaling);
        if (this.rotationQuaternion) {
            clonedEmitter.rotationQuaternion = this.rotationQuaternion.clone();
        }
        clonedEmitter.setEnabled(this.isEnabled());
        return clonedEmitter;
    }

    toJSON(meta?: any, options: SerializationOptions = {}): any {
        return {
            uuid: (this as any)._quarksUUID ?? this.uniqueId.toString(),
            type: 'ParticleEmitter',
            name: this.name,
            position: [this.position.x, this.position.y, this.position.z],
            rotation: [this.rotation.x, this.rotation.y, this.rotation.z],
            quaternion: this.rotationQuaternion
                ? [
                      this.rotationQuaternion.x,
                      this.rotationQuaternion.y,
                      this.rotationQuaternion.z,
                      this.rotationQuaternion.w,
                  ]
                : undefined,
            scale: [this.scaling.x, this.scaling.y, this.scaling.z],
            visible: this.isEnabled(),
            ps: this.system.toJSON(meta, options),
        };
    }
}
