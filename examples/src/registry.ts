import {demoManifest} from './demoManifest';
import type {DemoDefinition, DemoModule} from './types';

// One chunk per demo: the viewer loads only the demo it opens.
const demoModules = import.meta.glob<DemoModule>('./demos/*.ts');

export const demos: DemoDefinition[] = demoManifest.map((entry) => {
    const load = demoModules[`./demos/${entry.module}.ts`];
    if (!load) {
        throw new Error(`Demo module not found: ./demos/${entry.module}.ts`);
    }
    return {...entry, sourcePath: `examples/src/demos/${entry.module}.ts`, load};
});
