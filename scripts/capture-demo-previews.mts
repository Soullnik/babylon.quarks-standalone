import {mkdir} from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {demoManifest} from "../examples/src/demoManifest.ts";

const VIEWPORT = {width: 1280, height: 720};
const BASE_URL = process.env.EXAMPLES_BASE_URL ?? "http://localhost:3010";
const OUTPUT_DIR = path.resolve("examples/public/previews");

/**
 * Builds deterministic preview filename from demo key.
 */
function getPreviewFilename(demoKey: string) {
    const fileSafeName = demoKey
        .replace(/Demo$/u, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase();
    return `${fileSafeName}.png`;
}

/**
 * Captures one screenshot for a specific demo page hash.
 */
async function captureDemoPreview(page: import("playwright").Page, demo: (typeof demoManifest)[number]) {
    const previewFilename = getPreviewFilename(demo.key);
    const previewPath = path.join(OUTPUT_DIR, previewFilename);
    const demoUrl = `${BASE_URL}/babylonDemo.html#${demo.key}`;

    await page.goto(demoUrl, {waitUntil: "networkidle"});
    await page.waitForTimeout(3000);
    await page.screenshot({path: previewPath});

    return previewFilename;
}

/**
 * Captures preview images for all demos in the manifest.
 */
async function main() {
    await mkdir(OUTPUT_DIR, {recursive: true});

    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage({viewport: VIEWPORT});

    try {
        for (const demo of demoManifest) {
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
