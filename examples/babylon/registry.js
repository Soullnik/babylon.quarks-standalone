import {initMuzzleFlashBabylonDemo} from './demos/muzzleFlash.babylon.js';
import {initExplosionBabylonDemo, updateExplosionBabylonDemo} from './demos/explosion.babylon.js';
import {initEmitterShapeBabylonDemo} from './demos/emitterShape.babylon.js';
import {initTrailBabylonDemo, updateTrailBabylonDemo} from './demos/trail.babylon.js';
import {initSequencerBabylonDemo} from './demos/sequencer.babylon.js';
import {initMeshMaterialBabylonDemo} from './demos/meshMaterial.babylon.js';
import {initSubEmitterBabylonDemo, updateSubEmitterBabylonDemo} from './demos/subEmitter.babylon.js';
import {initTurbulenceBabylonDemo} from './demos/turbulence.babylon.js';
import {initAlphaTestBabylonDemo} from './demos/alphaTest.babylon.js';
import {initCustomPluginBabylonDemo} from './demos/customPlugin.babylon.js';
import {initBillboardBabylonDemo} from './demos/billboard.babylon.js';
import {initSoftParticleBabylonDemo} from './demos/softParticle.babylon.js';
import {initCustomBlendingBabylonDemo} from './demos/customBlending.babylon.js';
import {initFollowObjectBabylonDemo, updateFollowObjectBabylonDemo} from './demos/followObject.babylon.js';
import {initPickUpBabylonDemo, updatePickUpBabylonDemo} from './demos/pickUp.babylon.js';
import {initLevelUpBabylonDemo, updateLevelUpBabylonDemo} from './demos/levelUp.babylon.js';
import {initElectricBallBabylonDemo, updateElectricBallBabylonDemo} from './demos/electricBall.babylon.js';
import {initBlackHoleBabylonDemo} from './demos/blackhole.babylon.js';
import {demoManifest} from './demoManifest.js';

function updateMuzzleFlash(context, delta) {
    const {systems, demoState} = context;
    const refreshTime = 1;
    const systemsPerGroup = 6;
    const numGroups = Math.floor(systems.length / systemsPerGroup);
    while (Math.floor((demoState.totalTime / refreshTime) * numGroups) >= demoState.refreshIndex) {
        if (demoState.refreshIndex < numGroups) {
            for (let s = demoState.refreshIndex * systemsPerGroup; s < demoState.refreshIndex * systemsPerGroup + systemsPerGroup && s < systems.length; s++) {
                systems[s].restart();
                systems[s].play();
            }
        }
        demoState.refreshIndex++;
    }
    demoState.totalTime += delta;
    if (demoState.totalTime > refreshTime) {
        demoState.totalTime = 0;
        demoState.refreshIndex = 0;
    }
}

const demoRuntimeMap = {
    MuzzleFlashDemo: {init: initMuzzleFlashBabylonDemo, onFrame: updateMuzzleFlash},
    ExplosionDemo: {init: initExplosionBabylonDemo, onFrame: updateExplosionBabylonDemo},
    EmitterShapeDemo: {init: initEmitterShapeBabylonDemo},
    TrailDemo: {init: initTrailBabylonDemo, onFrame: updateTrailBabylonDemo},
    SequencerDemo: {init: initSequencerBabylonDemo},
    MeshMaterialDemo: {init: initMeshMaterialBabylonDemo},
    SubEmitterDemo: {init: initSubEmitterBabylonDemo, onFrame: updateSubEmitterBabylonDemo},
    TurbulenceDemo: {init: initTurbulenceBabylonDemo},
    AlphaTestDemo: {init: initAlphaTestBabylonDemo},
    CustomPluginDemo: {init: initCustomPluginBabylonDemo},
    BillboardDemo: {init: initBillboardBabylonDemo},
    SoftParticleDemo: {init: initSoftParticleBabylonDemo},
    CustomBlendingDemo: {init: initCustomBlendingBabylonDemo},
    FollowObjectDemo: {init: initFollowObjectBabylonDemo, onFrame: updateFollowObjectBabylonDemo},
    PickUpDemo: {init: initPickUpBabylonDemo, onFrame: updatePickUpBabylonDemo},
    LevelUpDemo: {init: initLevelUpBabylonDemo, onFrame: updateLevelUpBabylonDemo},
    ElectricBallDemo: {init: initElectricBallBabylonDemo, onFrame: updateElectricBallBabylonDemo},
    BlackHoleDemo: {init: initBlackHoleBabylonDemo},
};

export const babylonDemos = demoManifest.map((demo) => ({
    ...demo,
    ...demoRuntimeMap[demo.key],
}));
