import {defineConfig} from "vite";
import {resolve} from "path";
import {fileURLToPath} from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const base =
    process.env.GITHUB_ACTIONS === "true" && repositoryName ? `/${repositoryName}/` : "/";

export default defineConfig({
    base,
    server: {
        port: 8000,
    },
    preview: {
        port: 8000,
    },
    resolve: {
        alias: {
            "babylon.quarks-editor/react": resolve(__dirname, "../packages/babylon.quarks-editor/src/react/index.ts"),
            "babylon.quarks-editor": resolve(__dirname, "../packages/babylon.quarks-editor/src/index.ts"),
            "babylon.quarks": resolve(__dirname, "../packages/babylon.quarks/src/index.ts"),
        },
    },
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, "index.html"),
                babylon: resolve(__dirname, "babylonDemo.html"),
                benchmark: resolve(__dirname, "benchmark.html"),
                editor: resolve(__dirname, "editor.html"),
            },
        },
    },
});
