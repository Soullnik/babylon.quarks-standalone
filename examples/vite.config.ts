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

// The effect file schema is published beside the site, at the URL its `$id` names, so editors can
// fetch it from a file's `$schema`. Schemas of earlier formats stay in `public/schema`, so a file
// that names one keeps its checks after the format moves on.
const effectSchema = readFileSync(resolve(__dirname, '../packages/babylon.quarks/schema/effect.schema.json'), 'utf8');
const effectSchemaPath = `schema/${new URL(JSON.parse(effectSchema).$id).pathname.split('/').pop()}`;

export default defineConfig({
    base,
    plugins: [
        {
            name: 'quarks-effect-schema',
            configureServer(server) {
                server.middlewares.use(`${base}${effectSchemaPath}`, (_request, response) => {
                    response.setHeader('Content-Type', 'application/schema+json');
                    response.end(effectSchema);
                });
            },
            generateBundle() {
                this.emitFile({type: 'asset', fileName: effectSchemaPath, source: effectSchema});
            },
        },
    ],
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
        rolldownOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                babylon: resolve(__dirname, 'babylonDemo.html'),
                benchmark: resolve(__dirname, 'benchmark.html'),
                editor: resolve(__dirname, 'editor.html'),
                shaders: resolve(__dirname, 'shader-validate.html'),
            },
            output: {
                // React gets a chunk of its own, so the editor page caches it apart from Babylon.
                codeSplitting: {
                    groups: [{name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/}],
                },
            },
        },
    },
});
