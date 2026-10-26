import {execSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import semver from 'semver';

// Installs one version of Babylon.js across the repository, so CI can build and test against the
// lowest release the `@babylonjs/core` peer range admits and against the latest one.
//
//   node scripts/use-babylon.mjs lowest | latest | <version>
//
// Every `@babylonjs/*` dependency of the root and of each workspace is pinned to that version and
// installed again; a workspace left on its own range would get a copy of its own, and the build
// would mix two Babylons. The package files and the lockfile are changed in place, for CI to throw
// away: do not commit them.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));

const rootPackage = readJSON(join(repoRoot, 'package.json'));
// Workspaces are `dir` or `dir/*`.
const workspaces = rootPackage.workspaces.flatMap((pattern) =>
    pattern.endsWith('/*')
        ? readdirSync(join(repoRoot, pattern.slice(0, -2))).map((name) => join(pattern.slice(0, -2), name))
        : [pattern]
);
const manifests = ['package.json', ...workspaces.map((workspace) => join(workspace, 'package.json'))].filter(
    (manifest) => existsSync(join(repoRoot, manifest))
);

function resolveVersion(request) {
    if (request === 'lowest') {
        const peer = readJSON(join(repoRoot, 'packages/babylon.quarks/package.json')).peerDependencies[
            '@babylonjs/core'
        ];
        return semver.minVersion(peer).version;
    }
    if (request === 'latest') {
        return execSync('npm view @babylonjs/core@latest version', {encoding: 'utf8'}).trim();
    }
    if (!semver.valid(request)) {
        throw new Error(`Expected "lowest", "latest" or a version, got "${request ?? ''}".`);
    }
    return request;
}

const version = resolveVersion(process.argv[2]);

// Babylon's packages are released together, but not every package at every version: the others
// take their newest release up to `version` in its major.
const versions = new Map();
function versionOf(name) {
    if (!versions.has(name)) {
        const published = JSON.parse(execSync(`npm view ${name} versions --json`, {encoding: 'utf8'}));
        const match = semver.maxSatisfying(published, `>=${semver.major(version)}.0.0 <=${version}`);
        if (!match) {
            throw new Error(`${name} has no release up to ${version} in its major.`);
        }
        versions.set(name, match);
    }
    return versions.get(name);
}

for (const manifest of manifests) {
    const path = join(repoRoot, manifest);
    const pkg = readJSON(path);
    let changed = false;
    for (const field of ['dependencies', 'devDependencies']) {
        for (const name of Object.keys(pkg[field] ?? {})) {
            if (name.startsWith('@babylonjs/')) {
                pkg[field][name] = versionOf(name);
                changed = true;
            }
        }
    }
    if (changed) {
        writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`);
    }
}

// The root's overrides reach the copies other packages' peer ranges would install, too.
const root = readJSON(join(repoRoot, 'package.json'));
root.overrides = {...root.overrides, ...Object.fromEntries(versions)};
writeFileSync(join(repoRoot, 'package.json'), `${JSON.stringify(root, null, 4)}\n`);

// npm keeps a locked copy that still meets some peer range, so Babylon's entries leave the
// lockfile and npm resolves them again, against the pins above.
const lockPath = join(repoRoot, 'package-lock.json');
const lock = readJSON(lockPath);
for (const key of Object.keys(lock.packages)) {
    if (/(^|\/)node_modules\/@babylonjs\//.test(key)) {
        delete lock.packages[key];
    }
}
writeFileSync(lockPath, `${JSON.stringify(lock, null, 4)}\n`);

console.log(`Installing ${[...versions].map(([name, v]) => `${name}@${v}`).join(', ')}.`);
execSync('npm install --no-audit --no-fund', {cwd: repoRoot, stdio: 'inherit'});
const installed = readJSON(join(repoRoot, 'node_modules/@babylonjs/core/package.json')).version;
if (installed !== version) {
    throw new Error(`Installed @babylonjs/core ${installed}, expected ${version}.`);
}
