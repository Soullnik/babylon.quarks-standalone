import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {demoManifest} from '../examples/src/demoManifest.ts';

/**
 * Screenshots every demo into `examples/public/previews/<key>.png`, what the gallery shows
 * and what `check:demos` requires. Serve the examples first (`npm run dev`).
 *
 *   EXAMPLES_BASE_URL  where the examples are served (default http://localhost:3010)
 *   CHROMIUM_PATH      a Chromium to use instead of Playwright's own
 *   --only=A,B         capture only these demo keys (default every demo in the manifest)
 */
const VIEWPORT = {width: 1280, height: 720};
const BASE_URL = process.env.EXAMPLES_BASE_URL ?? 'http://localhost:3010';
const OUTPUT_DIR = path.resolve('examples/public/previews');
const only = process.argv
    .find((a) => a.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',')
    .filter(Boolean);

/**
 * Builds deterministic preview filename from demo key.
 */
function getPreviewFilename(demoKey: string) {
    const fileSafeName = demoKey
        .replace(/Demo$/u, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
    return `${fileSafeName}.png`;
}

/**
 * Captures one screenshot for a specific demo page hash.
 */
async function captureDemoPreview(page: import('playwright').Page, demo: (typeof demoManifest)[number]) {
    const previewFilename = getPreviewFilename(demo.key);
    const previewPath = path.join(OUTPUT_DIR, previewFilename);
    const demoUrl = `${BASE_URL}/babylonDemo.html#${demo.key}`;

    await page.goto(demoUrl, {waitUntil: 'networkidle'});
    await page.waitForTimeout(3000);
    await page.screenshot({path: previewPath});

    return previewFilename;
}

/**
 * Captures preview images for all demos in the manifest.
 */
async function main() {
    await mkdir(OUTPUT_DIR, {recursive: true});

    const browser = await chromium.launch({
        headless: true,
        // Software GL, so the capture works on a machine without a GPU, as `demo-smoke.mjs` does.
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    });
    const page = await browser.newPage({viewport: VIEWPORT});

    try {
        const demos = only ? demoManifest.filter((demo) => only.includes(demo.key)) : demoManifest;
        if (only && demos.length !== only.length) {
            throw new Error(
                `unknown demo key in --only: ${only.filter((k) => !demos.some((d) => d.key === k)).join(', ')}`
            );
        }
        for (const demo of demos) {
            const previewFilename = await captureDemoPreview(page, demo);
            console.log(`Captured ${demo.key} -> previews/${previewFilename}`);
        }
    } finally {
        await page.close();
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
