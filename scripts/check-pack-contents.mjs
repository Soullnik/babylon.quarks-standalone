import {execSync} from "node:child_process";
import {readFileSync} from "node:fs";

/**
 * Validates that npm pack output contains publish-critical artifacts.
 */
function getPackResult() {
  const rawOutput = execSync(
    "npm pack --dry-run --json --workspace=babylon.quarks",
    {encoding: "utf8"}
  );
  const parsedOutput = JSON.parse(rawOutput);
  if (!Array.isArray(parsedOutput) || parsedOutput.length === 0) {
    throw new Error("npm pack did not return JSON artifacts.");
  }
  return parsedOutput[0];
}

/**
 * Ensures all required files are present inside tarball.
 */
function assertRequiredFiles(packResult) {
  const filePaths = new Set((packResult.files ?? []).map((entry) => entry.path));
  const requiredFiles = [
    "dist/babylon.quarks.esm.js",
    "dist/babylon.quarks.cjs",
    "dist/babylon.quarks.umd.min.js",
    "dist/types/index.d.ts",
    "LICENSE",
    "README.md",
  ];

  const missingFiles = requiredFiles.filter((filePath) => !filePaths.has(filePath));
  if (missingFiles.length > 0) {
    throw new Error(`Missing publish artifacts: ${missingFiles.join(", ")}`);
  }
}

/**
 * quarks.core is a vendored fork bundled into the dist artifacts, so the
 * published package must not declare any runtime dependencies — a consumer
 * install must never pull the upstream quarks.core from the registry.
 */
function assertNoRuntimeDependencies() {
  const manifestUrl = new URL("../packages/babylon.quarks/package.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  const dependencyNames = Object.keys(manifest.dependencies ?? {});
  if (dependencyNames.length > 0) {
    throw new Error(
      `babylon.quarks must stay dependency-free (quarks.core is bundled), found: ${dependencyNames.join(", ")}`
    );
  }
}

/**
 * Main entrypoint for pack verification script.
 */
function main() {
  const packResult = getPackResult();
  assertRequiredFiles(packResult);
  assertNoRuntimeDependencies();
  console.log("Pack artifacts are valid.");
}

main();
