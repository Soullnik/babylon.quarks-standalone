import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

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
 * Main entrypoint for pack verification script.
 */
function main() {
    assertRequiredFiles('babylon.quarks', getPackResult('babylon.quarks'), [
        'dist/babylon.quarks.esm.js',
        'dist/babylon.quarks.cjs',
        'dist/babylon.quarks.umd.min.js',
        'dist/types/index.d.ts',
        'LICENSE',
        'README.md',
    ]);
    assertNoRuntimeDependencies('babylon.quarks');

    assertRequiredFiles('babylon.quarks-editor', getPackResult('babylon.quarks-editor'), [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/react/index.js',
        'dist/react/index.d.ts',
        'LICENSE',
        'README.md',
    ]);
    assertNoRuntimeDependencies('babylon.quarks-editor');

    console.log('Pack artifacts are valid.');
}

main();
