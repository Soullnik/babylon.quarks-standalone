/**
 * Writes the demo lists that live outside the examples app from `examples/src/demoManifest.ts`,
 * so they never drift from the gallery:
 *
 * - the preview tables of the root `README.md`, one per gallery section;
 * - the showcase previews and the demo count of `packages/babylon.quarks/README.md`;
 * - the demo count the landing page shows before its script runs (`examples/index.html`).
 *
 * Each list sits between `<!-- demos:<name> -->` and `<!-- /demos:<name> -->` markers.
 *
 *   npm run docs:demos            rewrite the lists
 *   npm run docs:demos -- --check fail if a list is out of date (CI)
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {format, resolveConfig} from 'prettier';
import {demoManifest, previewFile, SECTIONS} from '../examples/src/demoManifest.ts';
import type {DemoManifestEntry} from '../examples/src/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const SITE = 'https://soullnik.github.io/babylon.quarks-standalone/';
const RAW = 'https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/';
const COLUMNS = 4;

const demoUrl = (demo: DemoManifestEntry) => `${SITE}babylonDemo.html#${demo.key}`;

/** A Markdown table of preview images, `COLUMNS` to a row, each linking to its demo. */
function previewTable(demos: DemoManifestEntry[], imageBase: string, captions: boolean): string {
    const cell = (demo: DemoManifestEntry) => {
        const image = `[![${demo.name}](${imageBase}examples/public/previews/${previewFile(demo.key)})](${demoUrl(demo)})`;
        return captions ? `${image}<br>[${demo.name}](${demoUrl(demo)})` : image;
    };
    const rows: string[] = [];
    for (let i = 0; i < demos.length; i += COLUMNS) {
        const row = demos.slice(i, i + COLUMNS).map(cell);
        while (row.length < COLUMNS) row.push('');
        rows.push(`| ${row.join(' | ')} |`);
    }
    const header = `|${' |'.repeat(COLUMNS)}\n|${' --- |'.repeat(COLUMNS)}`;
    return `${header}\n${rows.join('\n')}`;
}

function sectionDemos(section: (typeof SECTIONS)[number]): DemoManifestEntry[] {
    return section.categories.flatMap((category) =>
        demoManifest.filter((demo) => demo.section === section.id && demo.category === category)
    );
}

/** Puts `content` between the markers of `name` in `text`. */
function fill(text: string, file: string, name: string, content: string, inline = false): string {
    const open = `<!-- demos:${name} -->`;
    const close = `<!-- /demos:${name} -->`;
    const start = text.indexOf(open);
    const end = text.indexOf(close);
    if (start < 0 || end < start) {
        throw new Error(`${file}: no ${open} … ${close} markers`);
    }
    const body = inline ? content : `\n\n${content}\n\n`;
    return text.slice(0, start + open.length) + body + text.slice(end);
}

const rootReadme = SECTIONS.map(
    (section) =>
        `**${section.title}**: ${section.categories.filter((c) => demoManifest.some((d) => d.category === c)).join(' · ')}\n\n${previewTable(sectionDemos(section), '', true)}`
).join('\n\n');
const showcase = sectionDemos(SECTIONS.find((section) => section.id === 'showcase')!);

const edits: [string, (text: string, file: string) => string][] = [
    ['README.md', (text, file) => fill(text, file, 'table', rootReadme)],
    [
        'packages/babylon.quarks/README.md',
        (text, file) =>
            fill(
                fill(text, file, 'table', previewTable(showcase, RAW, false)),
                file,
                'count',
                String(demoManifest.length),
                true
            ),
    ],
    ['examples/index.html', (text, file) => fill(text, file, 'count', String(demoManifest.length), true)],
];

let stale = 0;
for (const [relative, edit] of edits) {
    const file = join(root, relative);
    const before = readFileSync(file, 'utf8');
    const options = await resolveConfig(file);
    const after = await format(edit(before, relative), {...options, filepath: file});
    if (after === before) {
        continue;
    }
    if (check) {
        console.error(`${relative}: the demo list is out of date; run \`npm run docs:demos\``);
        stale++;
    } else {
        writeFileSync(file, after);
        console.log(`updated ${relative}`);
    }
}
process.exit(stale === 0 ? 0 : 1);
