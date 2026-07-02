import {execSync} from "node:child_process";

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
 * Main entrypoint for pack verification script.
 */
function main() {
  const packResult = getPackResult();
  assertRequiredFiles(packResult);
  console.log("Pack artifacts are valid.");
}

main();
