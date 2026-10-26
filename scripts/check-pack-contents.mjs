import {execFileSync, execSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Validates that npm pack output contains publish-critical artifacts.
 */
function getPackResult(workspace) {
    const rawOutput = execSync(`npm pack --dry-run --json --workspace=${workspace}`, {encoding: 'utf8'});
    const parsedOutput = JSON.parse(rawOutput);
    if (!Array.isArray(parsedOutput) || parsedOutput.length === 0) {
        throw new Error(`npm pack did not return JSON artifacts for ${workspace}.`);
    }
    return parsedOutput[0];
}

/**
 * Ensures all required files are present inside a tarball.
 */
function assertRequiredFiles(workspace, packResult, requiredFiles) {
    const filePaths = new Set((packResult.files ?? []).map((entry) => entry.path));
    const missingFiles = requiredFiles.filter((filePath) => !filePaths.has(filePath));
    if (missingFiles.length > 0) {
        throw new Error(`Missing publish artifacts in ${workspace}: ${missingFiles.join(', ')}`);
    }
}

/**
 * Published packages must not declare runtime dependencies: babylon.quarks bundles
 * quarks.core (a vendored fork) into its dist artifacts, and babylon.quarks-editor relies
 * entirely on peerDependencies (babylon.quarks/@babylonjs/core/react) so consumers don't get
 * a second copy pulled in from the registry.
 */
function assertNoRuntimeDependencies(packageDir) {
    const manifestUrl = new URL(`../packages/${packageDir}/package.json`, import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
    const dependencyNames = Object.keys(manifest.dependencies ?? {});
    if (dependencyNames.length > 0) {
        throw new Error(`${manifest.name} must stay dependency-free, found: ${dependencyNames.join(', ')}`);
    }
}

/**
 * The editor imports the library's newest API, so its peer range must be the library's own minor
 * line (`~X.Y.0`): a range that still admits an older minor lets npm install a babylon.quarks the
 * editor cannot link against, and one that leaves out the current version cannot be installed at
 * all. The two packages are released in lockstep; see CONTRIBUTING, "Releases".
 */
function assertEditorPeerInLockstep() {
    const read = (dir) => JSON.parse(readFileSync(new URL(`../packages/${dir}/package.json`, import.meta.url), 'utf8'));
    const library = read('babylon.quarks');
    const editor = read('babylon.quarks-editor');
    const [major, minor] = library.version.split('.');
    // A prerelease (0.28.0-beta.1) is outside `~0.28.0`, so the editor then names it exactly.
    const expected = library.version.includes('-') ? `~${library.version}` : `~${major}.${minor}.0`;
    const actual = editor.peerDependencies?.['babylon.quarks'];
    if (actual !== expected) {
        throw new Error(
            `babylon.quarks-editor's peer dependency on babylon.quarks is ${actual ?? 'missing'}; ` +
                `with babylon.quarks at ${library.version} it must be ${expected}.`
        );
    }
}

/**
 * The Unity exporter names the babylon.quarks release it writes for in every file it exports
 * (`ExporterInfo.Version`, checked against its own package.json by `npm run test:exporter`), so its
 * version moves with the library's.
 */
function assertExporterInLockstep() {
    const library = JSON.parse(
        readFileSync(new URL('../packages/babylon.quarks/package.json', import.meta.url), 'utf8')
    );
    const exporter = JSON.parse(
        readFileSync(new URL('../tools/unity-quarks-exporter/package.json', import.meta.url), 'utf8')
    );
    const info = readFileSync(
        new URL('../tools/unity-quarks-exporter/Editor/ExporterInfo.cs', import.meta.url),
        'utf8'
    );
    const csharp = /const string Version = "([^"]+)"/.exec(info)?.[1];
    if (exporter.version !== library.version || csharp !== library.version) {
        throw new Error(
            `The Unity exporter is at ${exporter.version} (package.json) and ${csharp} (ExporterInfo.cs); ` +
                `with babylon.quarks at ${library.version} both must be ${library.version}.`
        );
    }
}

/**
 * Peer dependencies the consumer project links from the repo's own node_modules, so the smoke
 * test runs offline against the same versions the packages are built with.
 */
const PEERS = [
    '@babylonjs/core',
    '@babylonjs/materials',
    '@heroicons/react',
    '@tanstack/react-virtual',
    'react',
    'react-dom',
];

function run(command, args, cwd) {
    try {
        return execFileSync(command, args, {cwd, encoding: 'utf8', stdio: 'pipe'});
    } catch (error) {
        throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${error.stdout ?? ''}${error.stderr ?? ''}`, {
            cause: error,
        });
    }
}

/**
 * Packs both workspaces for real, installs the tarballs into a throwaway consumer project and
 * imports them the way consumers do: Node ESM `import`, Node CJS `require` and TypeScript with
 * node16 resolution in both module kinds. Bundlers such as Vite resolve extensionless deep
 * imports leniently and hide what breaks in Node, webpack 5 and SSR; this catches it.
 */
function assertConsumersCanImport() {
    const consumer = mkdtempSync(join(tmpdir(), 'quarks-pack-'));
    try {
        const modules = join(consumer, 'node_modules');
        for (const workspace of ['babylon.quarks', 'babylon.quarks-editor']) {
            const [{filename}] = JSON.parse(
                run('npm', ['pack', '--json', `--workspace=${workspace}`, `--pack-destination=${consumer}`], repoRoot)
            );
            const target = join(modules, workspace);
            mkdirSync(target, {recursive: true});
            run('tar', ['-xzf', join(consumer, filename), '-C', target, '--strip-components=1'], consumer);
        }
        for (const peer of PEERS) {
            mkdirSync(dirname(join(modules, peer)), {recursive: true});
            symlinkSync(join(repoRoot, 'node_modules', peer), join(modules, peer), 'junction');
        }
        writeFileSync(join(consumer, 'package.json'), JSON.stringify({name: 'consumer', private: true}));

        const esm = `
            const quarks = await import('babylon.quarks');
            if (typeof quarks.BatchedRenderer !== 'function') throw new Error('babylon.quarks: no BatchedRenderer');
            const editor = await import('babylon.quarks-editor');
            if (typeof editor.EffectBinding !== 'function') throw new Error('babylon.quarks-editor: no EffectBinding');
            const session = await import('babylon.quarks-editor/session');
            if (typeof session.createEditorSession !== 'function') throw new Error('babylon.quarks-editor/session: no createEditorSession');
            const ui = await import('babylon.quarks-editor/react');
            if (typeof ui.EditorWorkspace !== 'function') throw new Error('babylon.quarks-editor/react: no EditorWorkspace');
            const {default: schema} = await import('babylon.quarks/schema/effect.schema.json', {with: {type: 'json'}});
            if (typeof schema.$id !== 'string') throw new Error('babylon.quarks/schema/effect.schema.json: no $id');`;
        run(process.execPath, ['--input-type=module', '-e', esm], consumer);
        // @babylonjs/core is ESM-only, so `require` works only where Node can require ES modules.
        if (process.features.require_module) {
            const cjs = `if (typeof require('babylon.quarks').BatchedRenderer !== 'function') throw new Error('no BatchedRenderer');`;
            run(process.execPath, ['-e', cjs], consumer);
        } else {
            console.log(`Skipping the CommonJS require check: Node ${process.version} cannot require ES modules.`);
        }

        const usage = `import {BatchedRenderer} from 'babylon.quarks';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {EffectBinding} from 'babylon.quarks-editor';
declare const renderer: BatchedRenderer;
export const node: TransformNode = renderer;
export const binding: typeof EffectBinding = EffectBinding;
`;
        writeFileSync(join(consumer, 'esm.mts'), usage);
        writeFileSync(
            join(consumer, 'cjs.cts'),
            usage
                .split('\n')
                .filter((line) => !line.includes('quarks-editor') && !line.includes('binding'))
                .join('\n')
        );
        const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
        writeFileSync(
            join(consumer, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    noEmit: true,
                    strict: true,
                    module: 'nodenext',
                    moduleResolution: 'nodenext',
                    target: 'es2020',
                    lib: ['es2020', 'dom'],
                    types: [],
                },
                files: ['esm.mts', 'cjs.cts'],
            })
        );
        // skipLibCheck stays off so errors inside our declaration bundles surface; errors inside
        // @babylonjs/core's own declarations (it needs @webgpu/types) are not ours and are ignored.
        let typeErrors = '';
        try {
            run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer);
        } catch (error) {
            const lines = error.message.split('\n').filter((line) => / error TS\d+/.test(line));
            // No diagnostics at all means tsc itself failed (bad config, crash): report all of it.
            typeErrors =
                lines.length === 0
                    ? error.message
                    : lines.filter((line) => !line.includes('node_modules/@babylonjs/')).join('\n');
        }
        if (typeErrors) {
            throw new Error(`Consumer type check failed:\n${typeErrors}`);
        }
    } finally {
        rmSync(consumer, {recursive: true, force: true});
    }
}

/**
 * Keeps each published bundle within its gzipped size budget (`scripts/size-budget.json`), so
 * growth is a decision a PR makes and says so, not something found after a release. A budget on a
 * directory covers every `.js` file under it.
 */
function assertSizeBudgets() {
    const budgets = JSON.parse(readFileSync(join(repoRoot, 'scripts/size-budget.json'), 'utf8'));
    const scripts = (path) =>
        statSync(path).isDirectory()
            ? readdirSync(path, {recursive: true})
                  .filter((name) => name.endsWith('.js'))
                  .map((name) => join(path, name))
            : [path];
    const over = [];
    for (const [target, budget] of Object.entries(budgets)) {
        if (target.startsWith('$')) {
            continue;
        }
        const files = scripts(join(repoRoot, target));
        const raw = Buffer.concat(files.map((file) => readFileSync(file)));
        const gzipped = gzipSync(raw, {level: 9}).length;
        const share = Math.round((gzipped / budget) * 100);
        console.log(`${target}: ${(gzipped / 1000).toFixed(1)} kB gzipped, ${share}% of its budget`);
        if (gzipped > budget) {
            over.push(`${target} is ${gzipped} bytes gzipped, over its budget of ${budget}`);
        }
    }
    if (over.length > 0) {
        throw new Error(`${over.join('\n')}\nSee scripts/size-budget.json.`);
    }
}

/**
 * Main entrypoint for pack verification script.
 */
function main() {
    assertEditorPeerInLockstep();
    assertExporterInLockstep();
    assertRequiredFiles('babylon.quarks', getPackResult('babylon.quarks'), [
        'dist/babylon.quarks.esm.js',
        'dist/babylon.quarks.cjs',
        'dist/babylon.quarks.umd.min.js',
        'schema/effect.schema.json',
        'dist/types/index.d.ts',
        'LICENSE',
        'README.md',
    ]);
    assertNoRuntimeDependencies('babylon.quarks');

    assertRequiredFiles('babylon.quarks-editor', getPackResult('babylon.quarks-editor'), [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/session.js',
        'dist/session.d.ts',
        'dist/react/index.js',
        'dist/react/index.d.ts',
        'LICENSE',
        'README.md',
    ]);
    assertNoRuntimeDependencies('babylon.quarks-editor');

    assertSizeBudgets();
    assertConsumersCanImport();

    console.log('Pack artifacts are valid.');
}

main();
