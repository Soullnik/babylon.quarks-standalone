import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const production = process.env.NODE_ENV === 'production';

const babylonExternal = ['@babylonjs/core', /^@babylonjs\/core\/.*/];

const typescriptPlugin = () =>
    typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationDir: undefined,
        composite: false,
    });

export default [
    // quarks.core is our vendored fork (packages/quarks.core) and is bundled
    // into every artifact — the published package has no runtime dependencies.
    {
        input: 'src/index.ts',
        output: [
            {
                file: 'dist/babylon.quarks.esm.js',
                format: 'esm',
                sourcemap: true,
            },
            {
                file: 'dist/babylon.quarks.cjs',
                format: 'cjs',
                sourcemap: true,
            },
        ],
        external: babylonExternal,
        plugins: [resolve(), commonjs(), typescriptPlugin(), production && terser()].filter(Boolean),
    },
    // Browser/CDN build for the Babylon.js Playground and <script> usage.
    // quarks.core is bundled in; @babylonjs/core resolves to the global BABYLON.
    {
        input: 'src/index.ts',
        output: {
            file: 'dist/babylon.quarks.umd.min.js',
            format: 'umd',
            name: 'BabylonQuarks',
            sourcemap: true,
            globals: (id) => (id.startsWith('@babylonjs/core') ? 'BABYLON' : id),
        },
        external: babylonExternal,
        plugins: [resolve(), commonjs(), typescriptPlugin(), terser()],
    },
    // Roll the tsc output (dist-types/, includes quarks.core via symlink) into a
    // single self-contained public declaration bundle.
    {
        input: 'dist-types/index.d.ts',
        output: {
            file: 'dist/types/index.d.ts',
            format: 'es',
        },
        external: babylonExternal,
        // respectExternal: inline everything (quarks.core) except the external list above
        plugins: [dts({respectExternal: true})],
    },
];
