import {readFileSync} from 'fs';
import {resolve} from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName ? `/${repositoryName}/` : '/';

// The landing page prints the published version (`%VITE_QUARKS_VERSION%` in index.html, and
// `import.meta.env.VITE_QUARKS_VERSION` in scripts), read from the package so it never goes stale.
const quarksPackage = JSON.parse(readFileSync(resolve(__dirname, '../packages/babylon.quarks/package.json'), 'utf8'));
process.env.VITE_QUARKS_VERSION = quarksPackage.version;

export default defineConfig({
    base,
    server: {
        port: 3010,
        // Cloudflare quick tunnels hit Vite with a *.trycloudflare.com Host header; any other host
        // is refused, as Vite does by default to block DNS rebinding.
        allowedHosts: ['.trycloudflare.com'],
    },
    preview: {
        port: 3010,
    },
    resolve: {
        alias: {
            'babylon.quarks-editor/session': resolve(__dirname, '../packages/babylon.quarks-editor/src/session.ts'),
            'babylon.quarks-editor/react': resolve(__dirname, '../packages/babylon.quarks-editor/src/react/index.ts'),
            'babylon.quarks-editor': resolve(__dirname, '../packages/babylon.quarks-editor/src/index.ts'),
            'babylon.quarks': resolve(__dirname, '../packages/babylon.quarks/src/index.ts'),
            'quarks.core': resolve(__dirname, '../packages/quarks.core/src/index.ts'),
        },
    },
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                babylon: resolve(__dirname, 'babylonDemo.html'),
                benchmark: resolve(__dirname, 'benchmark.html'),
                editor: resolve(__dirname, 'editor.html'),
                shaders: resolve(__dirname, 'shader-validate.html'),
            },
        },
    },
});
