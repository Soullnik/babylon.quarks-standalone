import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium, type Locator, type Page} from 'playwright';

/**
 * Screenshots the effect editor for `docs/AUTHORING.md` into `docs/images/authoring/`. Serve the
 * examples first (`npm run dev`, or `npm run build:examples && npm run preview -w examples`).
 *
 *   EXAMPLES_BASE_URL  where the examples are served (default http://localhost:3010)
 *   CHROMIUM_PATH      a Chromium to use instead of Playwright's own
 */
const BASE_URL = process.env.EXAMPLES_BASE_URL ?? 'http://localhost:3010';
const OUTPUT_DIR = path.resolve('docs/images/authoring');
const VIEWPORT = {width: 1440, height: 900};

/** The inspector module titled `title`. */
function module(page: Page, title: string): Locator {
    return page.locator('section').filter({has: page.locator('header', {hasText: new RegExp(`^${title}$`)})});
}

/** Opens the module titled `title`, turning it on first when it has an enable box that is off. */
async function openModule(page: Page, title: string): Promise<Locator> {
    const section = module(page, title).first();
    await section.scrollIntoViewIfNeeded();
    const box = section.locator('header input[type="checkbox"]');
    if ((await box.count()) > 0 && !(await box.isChecked())) {
        await box.check();
    }
    const body = section.locator(':scope > div');
    if ((await body.count()) === 0) {
        // By its left edge, the fold arrow: the header's centre can land on the hint icon, which
        // keeps the click to itself.
        await section.locator('header').click({position: {x: 12, y: 12}});
    }
    await page.waitForTimeout(300);
    return section;
}

/** Waits until the effect has been playing long enough to fill the viewport. */
async function waitForParticles(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const match = /(\d+) particles/.exec(document.body.innerText);
        return match !== null && Number(match[1]) > 50;
    });
}

async function shot(target: Page | Locator, name: string): Promise<void> {
    await target.screenshot({path: path.join(OUTPUT_DIR, `${name}.png`)});
    console.log(`  ${name}.png`);
}

async function main(): Promise<void> {
    await mkdir(OUTPUT_DIR, {recursive: true});
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({viewport: VIEWPORT});
    await page.goto(`${BASE_URL}/editor.html`, {waitUntil: 'networkidle'});

    // 1. The projects page and the new project dialog.
    await page.getByRole('button', {name: 'New project'}).click();
    await page.getByRole('button', {name: 'Cancel'}).waitFor();
    await page.locator('input:visible').last().fill('Campfire');
    await shot(page, '01-new-project');
    await page.getByRole('button', {name: 'Create'}).click();
    await waitForParticles(page);

    // 2. The whole editor with the starting effect.
    await shot(page, '02-editor');

    // 3–8. The modules the guide walks through, on a page tall enough for the longest, with the
    // timeline folded away so it does not cover them.
    await page.getByRole('button', {name: 'Collapse timeline'}).click();
    await page.setViewportSize({width: VIEWPORT.width, height: 1600});
    await shot(await openModule(page, 'Main'), '03-main');
    const emission = await openModule(page, 'Emission');
    const shape = await openModule(page, 'Shape');
    await emission.scrollIntoViewIfNeeded();
    await shot(emission, '04-emission');
    await shot(shape, '05-shape');
    await shot(await openModule(page, 'Color over Lifetime'), '06-color-over-lifetime');
    await shot(await openModule(page, 'Size over Lifetime'), '07-size-over-lifetime');
    await shot(await openModule(page, 'Renderer'), '08-renderer');

    // 9. The editor playing the finished effect, timeline open again.
    await page.setViewportSize(VIEWPORT);
    await page.getByRole('button', {name: 'Expand timeline'}).click();
    await waitForParticles(page);
    await shot(page.locator('body'), '09-playing');

    await browser.close();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
