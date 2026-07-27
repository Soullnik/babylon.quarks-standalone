import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Scene} from '@babylonjs/core/scene';

export type BabylonParticleMaterialParameters = Record<string, any>;

export class ParticleMeshStandardMaterial extends StandardMaterial {
    readonly isParticleMeshStandardMaterial = true;

    constructor(name: string, scene?: Scene, parameters: BabylonParticleMaterialParameters = {}) {
        super(name, scene);
        Object.assign(this, parameters);
    }
}

export class ParticleMeshPhysicsMaterial extends PBRMaterial {
    readonly isParticleMeshPhysicsMaterial = true;

    constructor(name: string, scene?: Scene, parameters: BabylonParticleMaterialParameters = {}) {
        super(name, scene);
        Object.assign(this, parameters);
    }
}
