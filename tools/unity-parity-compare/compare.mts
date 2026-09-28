/**
 * Renders every effect of a Unity parity capture (tools/unity-parity-capture) with babylon.quarks,
 * through the camera and at the times Unity used, and compares the two: frames side by side,
 * image statistics per frame, and particle aggregates per system against Unity's simulation.csv.
 *
 *   npx tsx tools/unity-parity-compare/compare.mts <capture folder> <output folder> [--only "Fire ayra,Water aura"] [--linear]
 *
 * --linear blends in linear space through a post-processed half-float target, as a Unity project in
 * Linear colour space does; without it the scene is Babylon's default gamma-space one.
 *
 * PARITY_CHROMIUM=<path to chrome> picks the browser when Playwright's own is not installed.
 *
 * The capture folder is the unzipped QuarksParity_<stamp>. babylon.quarks and quarks.core are
 * bundled from their sources, so a change to either shows up on the next run without a build.
 */
import {build} from 'esbuild';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import type {ImageStats, RenderedFrame, SystemStats, UnityCamera} from './harness';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ORIGIN = 'http://parity.test';

interface CameraJson extends UnityCamera {
    resolution: number;
    variants: Record<string, {times: number[]; frameIndices: number[]; applied: {background: number[]}}>;
}

interface SimulationJson {
    fixedDeltaTime: number;
    systems: Array<{index: number; path: string}>;
}

interface UnityRow {
    time: number;
    system: number;
    count: number;
    mean: number[];
    meanSize: number[];
    meanColor: number[];
}

function parseArgs(argv: string[]) {
    const positional: string[] = [];
    let only: string[] | null = null;
    let linear = false;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--only') only = argv[++i].split(',').map((s) => s.trim());
        else if (argv[i] === '--linear') linear = true;
        else positional.push(argv[i]);
    }
    if (positional.length < 2) {
        throw new Error('usage: compare.mts <capture folder> <output folder> [--only "A,B"] [--linear]');
    }
    return {capture: path.resolve(positional[0]), out: path.resolve(positional[1]), only, linear};
}

function readCsv(text: string): UnityRow[] {
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(',');
    const at = (name: string) => cols.indexOf(name);
    return lines.map((line) => {
        const v = line.split(',').map(Number);
        return {
            time: v[at('time')],
            system: v[at('system')],
            count: v[at('count')],
            mean: [v[at('meanX')], v[at('meanY')], v[at('meanZ')]],
            meanSize: [v[at('meanSizeX')], v[at('meanSizeY')], v[at('meanSizeZ')]],
            meanColor: [v[at('meanR')], v[at('meanG')], v[at('meanB')], v[at('meanA')]],
        };
    });
}

function nearestRows(rows: UnityRow[], time: number): Map<number, UnityRow> {
    let best = Infinity;
    for (const r of rows) best = Math.min(best, Math.abs(r.time - time));
    const result = new Map<number, UnityRow>();
    for (const r of rows) if (Math.abs(r.time - time) === best) result.set(r.system, r);
    return result;
}

function decodeDataUrl(url: string): Buffer {
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const pad3 = (n: number) => String(n).padStart(3, '0');

async function bundleHarness(): Promise<string> {
    const result = await build({
        entryPoints: [path.join(here, 'harness.ts')],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'error',
        alias: {
            'babylon.quarks': path.join(repo, 'packages/babylon.quarks/src/index.ts'),
            'quarks.core': path.join(repo, 'packages/quarks.core/src/index.ts'),
        },
        nodePaths: [path.join(repo, 'node_modules')],
    });
    return result.outputFiles[0].text;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const effectsDir = path.join(args.capture, 'effects');
    let effects = (await readdir(effectsDir, {withFileTypes: true})).filter((d) => d.isDirectory()).map((d) => d.name);
    if (args.only) effects = effects.filter((e) => args.only!.includes(e));
    effects.sort();
    await mkdir(args.out, {recursive: true});

    const script = await bundleHarness();
    const browser = await chromium.launch({
        headless: true,
        // A Chromium other than the one this Playwright version downloads, when set.
        executablePath: process.env.PARITY_CHROMIUM || undefined,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage();
    page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') console.log(`  [page ${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
    await page.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') {
            return route.fulfill({contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>'});
        }
        if (url.pathname === '/harness.js') {
            return route.fulfill({contentType: 'text/javascript', body: script});
        }
        if (url.pathname.startsWith('/capture/')) {
            const file = path.join(args.capture, decodeURIComponent(url.pathname.slice('/capture/'.length)));
            if (!file.startsWith(args.capture)) return route.fulfill({status: 403});
            try {
                return route.fulfill({body: await readFile(file)});
            } catch {
                return route.fulfill({status: 404});
            }
        }
        return route.fulfill({status: 404});
    });
    await page.goto(`${ORIGIN}/`);
    await page.addScriptTag({url: `${ORIGIN}/harness.js`});

    const simulationStep = 0.02;
    const report: Record<string, unknown>[] = [];
    for (const effect of effects) {
        console.log(`${effect}`);
        const dir = path.join(effectsDir, effect);
        const captureUrl = (rel: string) =>
            `${ORIGIN}/capture/${encodeURIComponent('effects')}/${encodeURIComponent(effect)}/${rel}`;
        const camera: CameraJson = JSON.parse(await readFile(path.join(dir, 'camera.json'), 'utf8'));
        const simulation: SimulationJson = JSON.parse(await readFile(path.join(dir, 'simulation.json'), 'utf8'));
        const csv = readCsv(await readFile(path.join(dir, 'simulation.csv'), 'utf8'));
        const outDir = path.join(args.out, effect);
        const entry: Record<string, unknown> = {effect, variants: {}};

        for (const variantId of ['raw_black', 'raw_gray']) {
            const variant = camera.variants[variantId];
            if (!variant) continue;
            const background = variant.applied.background as [number, number, number, number];
            let frames: RenderedFrame[];
            try {
                frames = await page.evaluate((request) => window.parity.render(request), {
                    effectUrl: captureUrl('effect.json'),
                    camera,
                    times: variant.times,
                    background,
                    step: simulation.fixedDeltaTime || simulationStep,
                    size: camera.resolution,
                    linear: args.linear,
                });
            } catch (e) {
                console.log(`  ${variantId}: render failed — ${(e as Error).message}`);
                (entry.variants as Record<string, unknown>)[variantId] = {error: (e as Error).message};
                continue;
            }
            const frameDir = path.join(outDir, 'quarks', variantId);
            await mkdir(frameDir, {recursive: true});
            const perFrame: Array<{
                index: number;
                time: number;
                unity: ImageStats;
                quarks: ImageStats;
                systems: unknown[];
            }> = [];
            for (let k = 0; k < frames.length; k++) {
                const index = variant.frameIndices[k];
                const file = path.join(frameDir, `${pad3(index)}.png`);
                await writeFile(file, decodeDataUrl(frames[k].png));
                const unityUrl = captureUrl(`frames/${variantId}/${pad3(index)}.png`);
                const [unity, quarks] = await page.evaluate(
                    ([u, q, bg]) => Promise.all([window.parity.imageStats(u, bg), window.parity.imageStats(q, bg)]),
                    [unityUrl, frames[k].png, background] as [string, string, number[]]
                );
                const rows = nearestRows(csv, variant.times[k]);
                const systems = simulation.systems.map((s, i) => {
                    const u = rows.get(s.index);
                    const q: SystemStats | undefined = frames[k].systems[i];
                    return {
                        path: s.path,
                        quarksName: q?.name,
                        unity: u && {count: u.count, mean: u.mean, meanSize: u.meanSize, meanColor: u.meanColor},
                        quarks: q && {count: q.count, mean: q.mean, meanSize: q.meanSize, meanColor: q.meanColor},
                    };
                });
                perFrame.push({index, time: variant.times[k], unity, quarks, systems});
            }

            // Side by side: Unity (and Unity with the project's post-processing) above quarks.
            const pick =
                variant.frameIndices.length > 6
                    ? [3, 7, 11, 15, 19, 23].filter((i) => variant.frameIndices.includes(i))
                    : variant.frameIndices;
            const rows = [{label: 'Unity', urls: pick.map((i) => captureUrl(`frames/${variantId}/${pad3(i)}.png`))}];
            if (variantId === 'raw_black') {
                for (const post of Object.keys(camera.variants).filter((v) => v.startsWith('post_'))) {
                    rows.push({
                        label: `Unity ${post}`,
                        urls: pick.map((i) => captureUrl(`frames/${post}/${pad3(i)}.png`)),
                    });
                }
            }
            rows.push({
                label: 'babylon.quarks',
                urls: pick.map(
                    (i) => `data:image/png;base64,${frames[variant.frameIndices.indexOf(i)].png.split(',')[1]}`
                ),
            });
            const sheetUrl = await page.evaluate(([r, labels]) => window.parity.sheet(r, 192, labels), [
                rows,
                pick.map((i) => `t=${variant.times[variant.frameIndices.indexOf(i)].toFixed(2)}s`),
            ] as [typeof rows, string[]]);
            await writeFile(path.join(outDir, `compare_${variantId}.png`), decodeDataUrl(sheetUrl));
            (entry.variants as Record<string, unknown>)[variantId] = perFrame;
        }
        await writeFile(path.join(outDir, 'compare.json'), JSON.stringify(entry, null, 1));
        report.push(entry);
    }
    await browser.close();

    // Summary: quarks relative to Unity, averaged over the raw_black frames.
    const lines = [
        '| effect | energy q/u | coverage q/u | clipped u / q | extent q/u (x, y) | centroid Δ px | covered colour u → q | count q/u |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const entry of report) {
        const frames = (entry.variants as Record<string, unknown>).raw_black as
            | Array<{
                  unity: ImageStats;
                  quarks: ImageStats;
                  systems: Array<{unity?: {count: number}; quarks?: {count: number}}>;
              }>
            | undefined;
        if (!Array.isArray(frames)) {
            lines.push(`| ${entry.effect} | render failed | | | | | | |`);
            continue;
        }
        const ratio = (f: (s: ImageStats) => number) =>
            mean(frames.filter((x) => f(x.unity) > 0).map((x) => f(x.quarks) / f(x.unity)));
        const centroid = mean(
            frames.map((x) =>
                Math.hypot(x.quarks.centroid[0] - x.unity.centroid[0], x.quarks.centroid[1] - x.unity.centroid[1])
            )
        );
        const uColor = frames[frames.length >> 1].unity.coveredColor.map((v) => v.toFixed(2)).join(' ');
        const qColor = frames[frames.length >> 1].quarks.coveredColor.map((v) => v.toFixed(2)).join(' ');
        const unityCount = mean(frames.map((x) => x.systems.reduce((a, s) => a + (s.unity?.count ?? 0), 0)));
        const quarksCount = mean(frames.map((x) => x.systems.reduce((a, s) => a + (s.quarks?.count ?? 0), 0)));
        lines.push(
            `| ${entry.effect} | ${fmt(ratio((s) => s.energy))} | ${fmt(ratio((s) => s.coverage))} | ` +
                `${fmt(mean(frames.map((x) => x.unity.clipped)), 3)} / ${fmt(mean(frames.map((x) => x.quarks.clipped)), 3)} | ` +
                `${fmt(ratio((s) => s.extent[0]))}, ${fmt(ratio((s) => s.extent[1]))} | ${fmt(centroid, 1)} | ` +
                `${uColor} → ${qColor} | ${fmt(quarksCount / unityCount)} |`
        );
    }
    await writeFile(path.join(args.out, 'report.md'), lines.join('\n') + '\n');
    await writeFile(path.join(args.out, 'report.json'), JSON.stringify(report, null, 1));
    console.log('\n' + lines.join('\n'));
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
