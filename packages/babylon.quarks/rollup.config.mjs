import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const production = process.env.NODE_ENV === 'production';

const babylonExternal = ['@babylonjs/core', /^@babylonjs\/core\/.*/];

const typescriptPlugin = () =>
    typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationDir: undefined,
    });

export default [
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
        external: [...babylonExternal, 'quarks.core'],
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
];
