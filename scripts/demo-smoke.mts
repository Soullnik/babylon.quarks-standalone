/**
 * Opens every demo of the examples app in headless Chromium and fails when one does not work:
 * a page error, a console error or warning, a demo whose `init` never finishes, one that never
 * has a particle alive, one that leaves the canvas empty, or one without its gallery preview.
 * This is the guard for "a demo stopped rendering" that unit tests on a NullEngine cannot see.
 * The first shard also opens the landing page and waits for its live stage to start.
 *
 * Serve the examples first (`npm run dev -w examples`, or `npm run preview -w examples` after
 * `npm run build:examples`), then `npm run check:demos`.
 *
 *   EXAMPLES_PORT   port the examples are served on (default 3010)
 *   CHROMIUM_PATH   a Chromium to use instead of Playwright's own
 *   --webgpu        open the demos with `?engine=webgpu` as well; needs a Chromium with a
 *                   working WebGPU adapter, so it is off by default (software adapters crash on
 *                   texture uploads)
 *   --seconds=S     seconds of the demo's own time to run each demo for (default 2.5, and at
 *                   least until the moment its preview is taken)
 *   --shard=I/N     open only every Nth demo, starting at the Ith (1-based), so CI can split the
 *                   demos over N machines. Demos are opened one at a time: software WebGL is
 *                   CPU-bound, so pages opened side by side each render fewer frames instead of
 *                   finishing sooner
 */
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, type Page} from 'playwright';
import {demoManifest, previewFile} from '../examples/src/demoManifest.ts';
import {examplesBase} from './examplesBase.mjs';

interface ViewerHook {
    ready: string | null;
    time: number;
    peakParticles: number;
    coverage(): Promise<number>;
}
declare global {
    interface Window {
        __quarksViewer?: ViewerHook;
        __quarksLanding?: {ready: boolean; stage: string};
    }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.EXAMPLES_PORT ?? '3010';
const base = await examplesBase(port);
const exe = process.env.CHROMIUM_PATH;
const webgpu = process.argv.includes('--webgpu');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const seconds = Number(arg('seconds') ?? 2.5);
const [shard, shards] = (arg('shard') ?? '1/1').split('/').map(Number);
if (!(shards >= 1 && shard >= 1 && shard <= shards)) {
    console.error(`--shard must be I/N with 1 <= I <= N, got ${arg('shard')}`);
    process.exit(1);
}
/** The least share of the canvas a demo must draw over the clear colour. */
const MIN_COVERAGE = 0.001;

const demos = demoManifest.filter((_, i) => i % shards === shard - 1);

// The gallery shows `previews/<file>.png` for every demo, captured by `npm run capture:previews`;
// a demo without one is a broken image on the front page.
const missingPreviews = demoManifest.filter(
    (demo) => !existsSync(join(root, 'examples/public/previews', previewFile(demo.key)))
);
if (missingPreviews.length > 0) {
    console.error(
        `demos without a gallery preview (run \`npm run capture:previews\`): ${missingPreviews.map((d) => d.key).join(', ')}`
    );
    process.exit(1);
}

// Errors and warnings any headless run produces that say nothing about the demos. "No
// available adapters" is Chromium's answer to the landing page asking for WebGPU on a machine
// without it, after which the page falls back to WebGL as designed.
const NOISE = /favicon|net::ERR_|404 \(|GL Driver Message|GPU stall due to ReadPixels|No available adapters/;

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

function listen(page: Page): string[] {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 300)));
    page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') {
            problems.push(`console ${m.type()}: ` + m.text().slice(0, 300));
        }
    });
    return problems;
}

function report(label: string, problems: string[]): boolean {
    const real = problems.filter((p) => !NOISE.test(p));
    console.log(
        `${real.length === 0 ? 'ok  ' : 'FAIL'} ${label}${real.length ? '\n    ' + real.slice(0, 4).join('\n    ') : ''}`
    );
    return real.length === 0;
}

let failures = 0;
const engines = webgpu ? ['', '?engine=webgpu'] : [''];
for (const engine of engines) {
    for (const demo of demos) {
        const page = await browser.newPage({viewport: {width: 800, height: 600}});
        const problems = listen(page);
        try {
            await page.goto(`${base}babylonDemo.html${engine}#${demo.key}`, {waitUntil: 'load', timeout: 60000});
            // `ready` names the demo once its `init` has finished: a 404 page, a demo that threw
            // or one that never finished building is a failure, not a quiet pass.
            await page.waitForFunction((key) => window.__quarksViewer?.ready === key, demo.key, {timeout: 60000});
            // The canvas is read at the moment the demo names as its best, when a one-shot effect
            // is surely on screen; then the demo runs on to `seconds`.
            const waitFor = (t: number) =>
                page.waitForFunction((at) => (window.__quarksViewer?.time ?? 0) >= at, t, {
                    timeout: 120000,
                    polling: 100,
                });
            await waitFor(demo.captureAt);
            const coverage = await page.evaluate(() => window.__quarksViewer!.coverage());
            if (coverage < MIN_COVERAGE) {
                problems.push(`the canvas is empty at ${demo.captureAt} s: ${(coverage * 100).toFixed(3)}% drawn`);
            }
            const until = Math.max(seconds, demo.captureAt);
            await waitFor(until);
            const peak = await page.evaluate(() => window.__quarksViewer!.peakParticles);
            if (peak === 0) {
                problems.push(`no particle was alive in ${until} s`);
            }
        } catch (e) {
            problems.push('navigation: ' + String(e).slice(0, 300));
        }
        if (!report(`${demo.key}${engine ? ' (webgpu)' : ''}`, problems)) failures++;
        await page.close();
    }
}

// The landing page: its gallery and live stage must come up without errors or warnings.
let landingPages = 0;
if (shard === 1) {
    for (const engine of engines) {
        landingPages++;
        const page = await browser.newPage({viewport: {width: 1280, height: 800}});
        const problems = listen(page);
        try {
            await page.goto(`${base}${engine}`, {waitUntil: 'load', timeout: 60000});
            await page.waitForFunction(() => window.__quarksLanding?.ready === true, undefined, {timeout: 60000});
            const stage = await page.evaluate(() => window.__quarksLanding!.stage);
            if (stage !== 'live') problems.push(`stage: expected 'live', got '${stage}'`);
            const cards = await page.locator('#demos-grid .demo').count();
            if (cards !== demoManifest.length)
                problems.push(`gallery: ${cards} cards for ${demoManifest.length} demos`);
            await page.waitForTimeout(3000);
        } catch (e) {
            problems.push('navigation: ' + String(e).slice(0, 300));
        }
        if (!report(`landing page${engine ? ' (webgpu)' : ''}`, problems)) failures++;
        await page.close();
    }
}
await browser.close();
console.log(
    `${demos.length * engines.length + landingPages} pages${shards > 1 ? ` (shard ${shard}/${shards})` : ''}, ${failures} with errors`
);
process.exit(failures === 0 ? 0 : 1);
