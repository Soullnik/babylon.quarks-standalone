import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {basename, join} from "node:path";

const SOURCE_DIR = fileURLToPath(new URL("../tools/unity-quarks-exporter/Editor/", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("../tools/unity-quarks-exporter/dist/", import.meta.url));
const OUT_FILE = join(OUT_DIR, "BabylonQuarksUnityExporter.unitypackage");
const DEST_ROOT = "Assets/BabylonQuarksUnityExporter";

/**
 * Unity identifies assets by GUID, not path — deriving it from the destination path keeps
 * it stable across rebuilds, so re-importing an updated package updates assets in place
 * instead of duplicating them.
 */
function guidFor(destPath) {
  return createHash("md5").update(destPath).digest("hex");
}

function folderMeta(guid) {
  return `fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`;
}

function scriptMeta(guid) {
  return `fileFormatVersion: 2\nguid: ${guid}\nMonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`;
}

function asmdefMeta(guid) {
  return `fileFormatVersion: 2\nguid: ${guid}\nAssemblyDefinitionImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`;
}

/**
 * Writes one GUID-keyed entry into the package staging tree: a folder gets
 * `asset.meta` + `pathname`; a file additionally gets a copy of its bytes as `asset`.
 */
function addEntry(stagingDir, destPath, sourceFile) {
  const guid = guidFor(destPath);
  const entryDir = join(stagingDir, guid);
  mkdirSync(entryDir, {recursive: true});
  writeFileSync(join(entryDir, "pathname"), `${destPath}\n`);
  if (!sourceFile) {
    writeFileSync(join(entryDir, "asset.meta"), folderMeta(guid));
    return;
  }
  const meta = destPath.endsWith(".asmdef") ? asmdefMeta(guid) : scriptMeta(guid);
  writeFileSync(join(entryDir, "asset.meta"), meta);
  cpSync(sourceFile, join(entryDir, "asset"));
}

/**
 * Packs the Unity exporter's Editor scripts into a .unitypackage — a gzipped tar of
 * GUID-named entries — so it can be dropped in via Assets > Import Package > Custom Package
 * instead of copying the Editor/ folder by hand.
 */
function main() {
  const sourceFiles = readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith(".cs") || name.endsWith(".asmdef"))
    .sort();
  if (sourceFiles.length === 0) {
    throw new Error(`No .cs/.asmdef files found under ${SOURCE_DIR}`);
  }

  const staging = mkdtempSync(join(tmpdir(), "quarks-unitypackage-"));
  try {
    addEntry(staging, DEST_ROOT);
    addEntry(staging, `${DEST_ROOT}/Editor`);
    for (const name of sourceFiles) {
      addEntry(staging, `${DEST_ROOT}/Editor/${name}`, join(SOURCE_DIR, name));
    }

    mkdirSync(OUT_DIR, {recursive: true});
    const guidDirs = readdirSync(staging);
    // Archive filename must be relative (not "D:\...") and run with cwd=OUT_DIR:
    // GNU tar treats a drive-letter-colon path as a remote host spec (scp-style
    // host:path), and Windows' bundled bsdtar doesn't support --force-local to
    // override that. A relative name sidesteps the ambiguity on both.
    execFileSync("tar", ["czf", basename(OUT_FILE), "-C", staging, ...guidDirs], {cwd: OUT_DIR});
  } finally {
    rmSync(staging, {recursive: true, force: true});
  }

  console.log(`Wrote ${OUT_FILE}`);
}

main();
