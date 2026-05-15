import {demoManifest} from "./demoManifest";
import type {DemoContext, DemoDefinition, DemoModule} from "./types";

const demoModules = import.meta.glob<DemoModule>("./demos/*.ts", {eager: true});

function getDemoModule(moduleId: string): DemoModule {
    const modulePath = `./demos/${moduleId}.ts`;
    const demoModule = demoModules[modulePath];
    if (!demoModule) {
        throw new Error(`Demo module not found: ${modulePath}`);
    }
    return demoModule;
}

function updateMuzzleFlash(ctx: DemoContext, delta: number) {
    const {systems, demoState} = ctx;
    const refreshTime = 1;
    const systemsPerGroup = 6;
    const numGroups = Math.floor(systems.length / systemsPerGroup);
    let totalTime = demoState.totalTime ?? 0;
    let refreshIndex = demoState.refreshIndex ?? 0;
    while (Math.floor((totalTime / refreshTime) * numGroups) >= refreshIndex) {
        if (refreshIndex < numGroups) {
            for (
                let s = refreshIndex * systemsPerGroup;
                s < refreshIndex * systemsPerGroup + systemsPerGroup && s < systems.length;
                s++
            ) {
                systems[s].restart();
                systems[s].play();
            }
        }
        refreshIndex += 1;
    }
    totalTime += delta;
    if (totalTime > refreshTime) {
        totalTime = 0;
        refreshIndex = 0;
    }
    demoState.totalTime = totalTime;
    demoState.refreshIndex = refreshIndex;
}

const frameOverrides: Partial<Record<string, DemoDefinition["onFrame"]>> = {
    MuzzleFlashDemo: updateMuzzleFlash,
};

export const demos: DemoDefinition[] = demoManifest.map((entry) => {
    const {init, update} = getDemoModule(entry.module);
    return {
        ...entry,
        init,
        onFrame: frameOverrides[entry.key] ?? update,
    };
});
