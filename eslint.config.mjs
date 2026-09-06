// One flat config for the whole monorepo. Type-aware rules are off: CI already
// runs `tsc --noEmit`, and the untyped preset lints fast enough to run on save.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/api/prisma/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Reads inside a decorator argument (`@Headers(SECRET_HEADER)`) are
      // invisible to this rule, so every NestJS controller constant trips it.
      'no-useless-assignment': 'off',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // API, shared types, Worker and scripts: Node.
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'services/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Verification and seeding scripts print their results; that is their whole
  // output.
  {
    files: ['apps/api/scripts/**/*.ts', 'scripts/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler's own lints. The SPA does not run the compiler; the
      // classic hook rules stay on.
      'react-hooks/incompatible-library': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Shadcn primitives and the providers export a helper next to the component
  // on purpose.
  {
    files: ['apps/web/src/components/ui/**', 'apps/web/src/providers/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Tooling run by hand: Node plus the browser globals Playwright evaluates.
  {
    files: ['apps/web/scripts/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['apps/web/e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
);
