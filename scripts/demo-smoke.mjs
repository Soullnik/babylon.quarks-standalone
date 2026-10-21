/**
 * Opens every demo of the examples app in headless Chromium and fails on any
 * page error or console error: the regression guard for "a demo stopped
 * rendering", which unit tests on a NullEngine cannot see.
 *
 * Serve the examples first (`npm run dev -w examples`, or `npm run preview -w
 * examples` after `npm run build:examples`), then `node scripts/demo-smoke.mjs`.
 *
 *   EXAMPLES_PORT   port the examples are served on (default 3010)
 *   CHROMIUM_PATH   a Chromium to use instead of Playwright's own
 *   --webgpu        open the demos with `?engine=webgpu` as well; needs a
 *                   Chromium with a working WebGPU adapter, so it is off by
 *                   default (software adapters crash on texture uploads)
 *   --frames=N      milliseconds to let each demo run (default 3500)
 *   --shard=I/N     open only every Nth demo, starting at the Ith (1-based), so
 *                   CI can split the demos over N machines. Demos are opened one
 *                   at a time: software WebGL is CPU-bound, so pages opened side
 *                   by side each render fewer frames instead of finishing sooner
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.EXAMPLES_PORT ?? '3010';
const exe = process.env.CHROMIUM_PATH;
const webgpu = process.argv.includes('--webgpu');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const settle = Number(arg('frames') ?? 3500);
const [shard, shards] = (arg('shard') ?? '1/1').split('/').map(Number);
if (!(shards >= 1 && shard >= 1 && shard <= shards)) {
    console.error(`--shard must be I/N with 1 <= I <= N, got ${arg('shard')}`);
    process.exit(1);
}

// Every `key: 'X'` in the manifest is a demo the gallery lists.
const manifest = readFileSync(join(root, 'examples/src/demoManifest.ts'), 'utf8');
const allKeys = [...manifest.matchAll(/^\s*key:\s*'([A-Za-z0-9_]+)'/gm)].map((m) => m[1]);
if (allKeys.length === 0) {
    console.error('no demo keys found in examples/src/demoManifest.ts');
    process.exit(1);
}
const keys = allKeys.filter((_, i) => i % shards === shard - 1);

// Errors any headless run produces that say nothing about the demos.
const NOISE = /favicon|net::ERR_|404 \(|GL Driver Message|GPU stall due to ReadPixels/;

const browser = await chromium.launch({
    args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        ...(webgpu ? ['--enable-unsafe-webgpu'] : []),
    ],
    ...(exe ? {executablePath: exe} : {}),
});

let failures = 0;
const engines = webgpu ? ['', '?engine=webgpu'] : [''];
for (const engine of engines) {
    for (const key of keys) {
        const page = await browser.newPage({viewport: {width: 800, height: 600}});
        const problems = [];
        page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 300)));
        page.on('console', (m) => {
            if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300));
        });
        const url = `http://127.0.0.1:${port}/babylonDemo.html${engine}#${key}`;
        try {
            await page.goto(url, {waitUntil: 'load', timeout: 60000});
            await page.waitForTimeout(settle);
        } catch (e) {
            problems.push('navigation: ' + String(e).slice(0, 300));
        }
        const real = problems.filter((p) => !NOISE.test(p));
        const label = `${key}${engine ? ' (webgpu)' : ''}`;
        console.log(
            `${real.length === 0 ? 'ok  ' : 'FAIL'} ${label}${real.length ? '\n    ' + real.slice(0, 4).join('\n    ') : ''}`
        );
        if (real.length) failures++;
        await page.close();
    }
}
await browser.close();
console.log(
    `${keys.length * engines.length} demo pages${shards > 1 ? ` (shard ${shard}/${shards})` : ''}, ${failures} with errors`
);
process.exit(failures === 0 ? 0 : 1);
