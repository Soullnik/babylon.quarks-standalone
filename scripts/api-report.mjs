// API reports: the public surface of every published entry point, as API Extractor sees it in the
// built declarations, kept in `packages/<package>/api/`. `npm run api:check` fails when the
// surface differs from the committed report, so a change to the public API shows in review as a
// diff of the report; `npm run api` writes the reports after an intended change.
//
// Run after `npm run build && npm run build:editor`.

import {Extractor, ExtractorConfig, ExtractorLogLevel} from '@microsoft/api-extractor';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update');

/**
 * Every entry point a package exports, by report name and built declaration file. babylon.quarks's
 * `require` types (`index.d.cts`) are the same bundle rollup writes to `index.d.ts`.
 */
const ENTRIES = [
    {pkg: 'quarks.core', name: 'quarks.core', types: 'dist/types/index.d.ts'},
    {pkg: 'babylon.quarks', name: 'babylon.quarks', types: 'dist/types/index.d.ts'},
    {pkg: 'babylon.quarks-editor', name: 'babylon.quarks-editor', types: 'dist/index.d.ts'},
    {pkg: 'babylon.quarks-editor', name: 'babylon.quarks-editor.session', types: 'dist/session.d.ts'},
    {pkg: 'babylon.quarks-editor', name: 'babylon.quarks-editor.react', types: 'dist/react/index.d.ts'},
];

let failed = false;
for (const entry of ENTRIES) {
    const dir = path.join(root, 'packages', entry.pkg);
    const types = path.join(dir, entry.types);
    if (!existsSync(types)) {
        console.error(`api: ${entry.name}: ${path.relative(root, types)} is missing; build first.`);
        failed = true;
        continue;
    }
    if (update) {
        mkdirSync(path.join(dir, 'api'), {recursive: true});
    }
    const config = ExtractorConfig.prepare({
        configObject: {
            projectFolder: dir,
            mainEntryPointFilePath: types,
            compiler: {tsconfigFilePath: path.join(dir, 'tsconfig.json')},
            apiReport: {
                enabled: true,
                reportFileName: `${entry.name}.api.md`,
                reportFolder: path.join(dir, 'api'),
                reportTempFolder: path.join(root, 'node_modules/.cache/api-report'),
            },
            newlineKind: 'lf',
            docModel: {enabled: false},
            dtsRollup: {enabled: false},
            tsdocMetadata: {enabled: false},
            messages: {
                compilerMessageReporting: {default: {logLevel: ExtractorLogLevel.Warning}},
                extractorMessageReporting: {
                    default: {logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true},
                    // The packages mark only what is internal; everything else is public.
                    'ae-missing-release-tag': {logLevel: ExtractorLogLevel.None},
                    // A type reachable from the API but not exported is listed in the report.
                    'ae-forgotten-export': {logLevel: ExtractorLogLevel.None, addToApiReportFile: true},
                    'ae-internal-missing-underscore': {logLevel: ExtractorLogLevel.None},
                    'ae-unresolved-link': {logLevel: ExtractorLogLevel.None},
                    // TypeDoc owns the comments; an accessor is documented on its getter.
                    'ae-undocumented': {logLevel: ExtractorLogLevel.None, addToApiReportFile: false},
                    'ae-setter-with-docs': {logLevel: ExtractorLogLevel.None, addToApiReportFile: false},
                },
                // TypeDoc checks the comments (`npm run docs:check`).
                tsdocMessageReporting: {default: {logLevel: ExtractorLogLevel.None}},
            },
        },
        configObjectFullPath: path.join(dir, 'api-extractor.json'),
        packageJsonFullPath: path.join(dir, 'package.json'),
    });
    const result = Extractor.invoke(config, {
        localBuild: update,
        showVerboseMessages: false,
        messageCallback: (message) => {
            // The checker's own TypeScript may be older than the project's: not a finding.
            if (
                message.messageId === 'console-compiler-version-notice' ||
                message.text?.startsWith('Analysis will use')
            ) {
                message.logLevel = ExtractorLogLevel.None;
            }
        },
    });
    if (!result.succeeded || (result.apiReportChanged && !update)) {
        failed = true;
        console.error(
            result.apiReportChanged
                ? `api: ${entry.name}: the public API changed. Review the change, then run \`npm run api\` and commit packages/${entry.pkg}/api/${entry.name}.api.md.`
                : `api: ${entry.name}: ${result.errorCount} errors, ${result.warningCount} warnings.`
        );
    } else {
        console.log(`api: ${entry.name}: ${result.apiReportChanged ? 'report written' : 'unchanged'}.`);
    }
}
process.exit(failed ? 1 : 0);
