import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {demoManifest} from '../examples/src/demoManifest.ts';

/**
 * Screenshots every demo into `examples/public/previews/<key>.png`, what the gallery shows
 * and what `check:demos` requires, plus the landing page's still images in
 * `examples/public/landing/` (the stage poster and the editor shot). Serve the examples first
 * (`npm run dev`).
 *
 *   EXAMPLES_BASE_URL  where the examples are served (default http://localhost:3010)
 *   CHROMIUM_PATH      a Chromium to use instead of Playwright's own
 *   --only=A,B         capture only these demo keys (default every demo in the manifest)
 *   --landing          capture only the landing page's images
 */
const VIEWPORT = {width: 1280, height: 720};
const BASE_URL = process.env.EXAMPLES_BASE_URL ?? 'http://localhost:3010';
const OUTPUT_DIR = path.resolve('examples/public/previews');
const LANDING_DIR = path.resolve('examples/public/landing');
const landingOnly = process.argv.includes('--landing');
// The viewer's toolbar, hint and drop overlay are UI, not the effect; previews show the effect only.
const HIDE_VIEWER_UI = '.hud, .hint, .drop-overlay { display: none !important; }';
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
    await page.addStyleTag({content: HIDE_VIEWER_UI});
    await page.waitForTimeout(3000);
    await page.screenshot({path: previewPath});

    return previewFilename;
}

/**
 * Captures the landing page's stage poster (the vortex, shown until the live stage starts and
 * to visitors who prefer reduced motion) and the editor screenshot.
 */
async function captureLanding(browser: import('playwright').Browser) {
    await mkdir(LANDING_DIR, {recursive: true});

    const stagePage = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2});
    await stagePage.goto(`${BASE_URL}/?engine=webgl`, {waitUntil: 'networkidle'});
    await stagePage.waitForFunction(() => document.querySelector('[data-stage]')?.getAttribute('data-live') === 'true');
    await stagePage.waitForTimeout(6000);
    await stagePage
        .locator('.stage-view canvas')
        .screenshot({path: path.join(LANDING_DIR, 'stage-poster.jpg'), quality: 82});
    console.log('Captured landing/stage-poster.jpg');

    // The editor shot opens the same vortex through the stage's "Open in editor", so it shows a
    // real effect in the hierarchy and inspector rather than the empty project list.
    await Promise.all([stagePage.waitForURL(/editor\.html/), stagePage.click('[data-stage-editor]')]);
    const effect = await stagePage.evaluate(() => sessionStorage.getItem('quarks-editor-effect'));
    await stagePage.close();

    const editorPage = await browser.newPage({viewport: {width: 1440, height: 900}});
    await editorPage.addInitScript((json) => {
        if (json) {
            sessionStorage.setItem('quarks-editor-effect', json);
        }
    }, effect);
    await editorPage.goto(`${BASE_URL}/editor.html?effect=session`, {waitUntil: 'networkidle'});
    await editorPage.waitForTimeout(6000);
    await editorPage.screenshot({path: path.join(LANDING_DIR, 'editor.jpg'), quality: 80});
    await editorPage.close();
    console.log('Captured landing/editor.jpg');
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
    if (landingOnly) {
        try {
            await captureLanding(browser);
        } finally {
            await browser.close();
        }
        return;
    }
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
