/**
 * Writes the examples' sample effects (`examples/src/shared/sampleEffects.ts`) as effect files
 * into `examples/public/effects/`, which the Loading Effects demo loads with `QuarksLoader`. Run it
 * after changing a sample effect, with the library built (`npm run build`):
 *
 *   npx tsx scripts/write-sample-effects.mts
 *
 * The images are written relative to the effect files, as `../textures/base/<name>.png`.
 */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {serializeEffect} from 'babylon.quarks';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {SAMPLE_EFFECTS} from '../examples/src/shared/sampleEffects.ts';

const OUTPUT_DIR = path.resolve('examples/public/effects');

const engine = new NullEngine();
const scene = new Scene(engine);
await mkdir(OUTPUT_DIR, {recursive: true});
for (const [name, build] of Object.entries(SAMPLE_EFFECTS)) {
    const root = build(scene);
    const json = serializeEffect(root, {
        generator: 'babylon.quarks examples',
        // The textures' urls are relative to the page; the files sit one folder down.
        imageUrl: (texture) => `../${texture.url}`,
        onWarning: (message) => {
            throw new Error(`${name}: ${message}`);
        },
    });
    const file = path.join(OUTPUT_DIR, `${name}.json`);
    await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log('wrote', path.relative(process.cwd(), file));
    root.dispose();
}
scene.dispose();
engine.dispose();
