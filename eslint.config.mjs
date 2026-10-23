// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['**/dist/**', '**/dist-types/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts', '.claude/**'],
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
            // Untrusted JSON is `unknown` and narrowed; tests reach internals with `obj['field']`.
            '@typescript-eslint/no-explicit-any': 'error',
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
