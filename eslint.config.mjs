// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['**/dist/**', '**/dist-types/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts'],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {...globals.browser, ...globals.node},
        },
        linterOptions: {reportUnusedDisableDirectives: 'error'},
        rules: {
            // Behaviors, shapes and generators implement shared interfaces, so a method may take a
            // parameter it does not read.
            '@typescript-eslint/no-unused-vars': [
                'error',
                {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true},
            ],
            // Typing the JSON readers and the editor's property bags is phase 3b's work; until then
            // `--max-warnings` in `npm run lint` keeps the count from growing.
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        files: ['packages/babylon.quarks-editor/src/**/*.tsx', 'examples/**/*.tsx'],
        extends: [reactHooks.configs.flat.recommended],
    },
    {
        files: ['**/test/**', '**/*.test.ts'],
        languageOptions: {globals: globals.jest},
    }
);
