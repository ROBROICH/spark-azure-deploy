//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactCompiler from 'eslint-plugin-react-compiler';
import reactHooks from 'eslint-plugin-react-hooks';
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const limitLogicFunctionLines = require('./eslint-plugins/limit-logic-function-lines.cjs');
const requireJsdocComplexity = require('./eslint-plugins/require-jsdoc-complexity.cjs');
const requireJsdocRecursion = require('./eslint-plugins/require-jsdoc-recursion.cjs');
const requireSuppressionDescription = require('./eslint-plugins/require-suppression-description.cjs');

const useEffectWarning = {
  selector: 'CallExpression[callee.name="useEffect"]',
  message:
    '⚠️  useEffect detected. Consider alternatives:\n' +
    '  1) Derived state (calculate during render)\n' +
    '  2) Event handler (onClick/onChange/onSubmit)\n' +
    '  3) TanStack Query (for data fetching)\n' +
    '  4) useSyncExternalStore (for external subscriptions)\n' +
    '  5) useLayoutEffect (for DOM measurements)\n' +
    '  6) Refs (for storing mutable values)\n' +
    '  7) Context + state (for shared state)\n' +
    '  8) Web APIs directly in handlers (localStorage, sessionStorage)\n' +
    'If legitimately needed (external subscriptions, manual DOM manipulation, 3rd party integrations),\n' +
    'suppress with: // eslint-disable-next-line no-restricted-syntax -- <reason>',
};

const useStateWarning = {
  selector: 'CallExpression[callee.name="useState"]',
  message:
    '⚠️  useState detected. Consider moving state to URL with TanStack Router:\n' +
    '  - useSearch() for search params (filters, pagination, sorting)\n' +
    '  - Route params for resource IDs\n' +
    '  - Benefits: shareable URLs, browser back/forward, bookmarkable state\n' +
    'Keep useState for: ephemeral UI state (hover, focus, animations), form inputs before submission.\n' +
    'If state must sync with external prop: use useControllableState instead.\n' +
    'Suppress with: // eslint-disable-next-line no-restricted-syntax -- <reason>',
};

const useMemoWarning = {
  selector: 'CallExpression[callee.name="useMemo"]',
  message:
    '⚠️  useMemo detected. React Compiler is enabled in this repo, so manual memoization is an exception.\n' +
    'Prefer plain expressions unless the current tree opts out with "use no memo" or a verified runtime boundary requires this memoization.\n' +
    'Suppress with: // eslint-disable-next-line no-restricted-syntax -- <reason>',
};

const useCallbackWarning = {
  selector: 'CallExpression[callee.name="useCallback"]',
  message:
    '⚠️  useCallback detected. React Compiler is enabled in this repo, so manual memoization is an exception.\n' +
    'Prefer inline functions unless the current tree opts out with "use no memo" or a verified runtime boundary requires a stable callback identity.\n' +
    'Suppress with: // eslint-disable-next-line no-restricted-syntax -- <reason>',
};

const namespaceImportWarning = {
  selector:
    "ImportNamespaceSpecifier:not([parent.source.value='react']):not([parent.source.value='zod']):not([parent.source.value='@sentry/react']):not([parent.source.value='@tanstack/react-query']):not([parent.source.value='@tanstack/react-router']):not([parent.source.value='../tanstack-query/root-provider.tsx']):not([parent.source.value='./integrations/tanstack-query/root-provider.tsx'])",
  message:
    'Namespace imports hide the actual dependency surface. Import the specific members you need instead, or suppress this line with a reason when a namespace import is truly required.',
};

const noPayloadsCollectionPropWarning = {
  selector: "JSXAttribute[name.name='payloadsCollection']",
  message:
    'Do not pass payload collections as props in ExaminationGraph components. Read them via route.useLoaderData() inside the mounted component that needs them.',
};

const noPayloadsCollectionPropTypeWarning = {
  selector:
    "TSTypeLiteral > TSPropertySignature[key.name='payloadsCollection']",
  message:
    'Do not model payload collections as component props in ExaminationGraph components. Read them via route.useLoaderData() inside the mounted component that needs them.',
};

const noUseLiveQueryDepsWarning = {
  selector: "CallExpression[callee.name='useLiveQuery'][arguments.length=2]",
  message:
    'Do not pass dependency arrays to useLiveQuery in ExaminationGraph components. Recreate the mounted component boundary instead.',
};

export default [
  {
    ignores: ['**/*.{js,mjs,cjs,jsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  ...tanstackConfig,
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'src/scripts/**/*.js',
      'eslint-plugins/**/*',
      'src/api-clients/**/*',
      'src/routeTree.gen.ts',
      'openapi-ts.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-compiler': reactCompiler,
      'react-hooks': reactHooks,
      react: react,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
      'jsx-a11y': jsxA11y,
      'custom-size': limitLogicFunctionLines,
      'custom-jsdoc': requireJsdocComplexity,
      'custom-recursion': requireJsdocRecursion,
      'custom-suppressions': requireSuppressionDescription,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...jsxA11y.configs.strict.rules,

      // Core image/link/interaction rules
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': [
        'error',
        {
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',

      // ARIA shape and usage
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      // Labels and form controls
      // NOTE: Both label rules are disabled because jsx-a11y doesn't recognize valid wrapped controls or valid htmlFor/id associations for labels.
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/control-has-associated-label': 'off',

      // Focus management & keyboard
      'jsx-a11y/tabindex-no-positive': 'error',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region'] }],
      'jsx-a11y/interactive-supports-focus': 'error',

      // Misc but important WCAG signals
      'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/lang': 'error',
      'import/order': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',

      // Autofixable consistency rules to keep control flow and types uniform.
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array',
          readonly: 'generic',
        },
      ],

      'no-console': 'error',
      'no-await-in-loop': 'warn',
      'no-else-return': ['warn', { allowElseIf: false }],
      'max-depth': ['warn', 2],
      'max-lines': [
        'warn',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'custom-size/limit-logic-function-lines': [
        'warn',
        {
          max: 75,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      '@typescript-eslint/no-use-before-define': [
        'warn',
        {
          functions: false,
          classes: true,
          enums: true,
          variables: true,
          typedefs: true,
          ignoreTypeReferences: true,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        {
          minimumDescriptionLength: 10,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],
      'custom-suppressions/require-suppression-description': [
        'warn',
        {
          minimumDescriptionLength: 10,
        },
      ],

      // React Compiler - catches unnecessary effects and other violations
      'react-compiler/react-compiler': 'error',

      // React Hooks - ensures proper hook usage
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React - catches common anti-patterns with useEffect
      'react/no-unstable-nested-components': 'warn',
      'react/jsx-no-constructed-context-values': 'warn',

      // "You Might Not Need an Effect" plugin - catches specific useEffect anti-patterns
      // See: https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect
      'react-you-might-not-need-an-effect/no-derived-state': 'warn',
      'react-you-might-not-need-an-effect/no-chain-state-updates': 'warn',
      'react-you-might-not-need-an-effect/no-event-handler': 'warn',
      'react-you-might-not-need-an-effect/no-adjust-state-on-prop-change':
        'warn',
      'react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change':
        'warn',
      'react-you-might-not-need-an-effect/no-pass-live-state-to-parent': 'warn',
      'react-you-might-not-need-an-effect/no-pass-data-to-parent': 'warn',
      'react-you-might-not-need-an-effect/no-pass-ref-to-parent': 'warn',
      'react-you-might-not-need-an-effect/no-initialize-state': 'warn',
      'react-you-might-not-need-an-effect/no-manage-parent': 'warn',
      'react-you-might-not-need-an-effect/no-empty-effect': 'warn',
      'sort-imports': 'off',
      'import/consistent-type-specifier-style': 'off',
      // General useEffect warning - forces developers to think about EVERY useEffect
      // Works alongside specific rules above to catch patterns not covered by them
      'no-restricted-syntax': [
        'warn',
        useEffectWarning,
        useStateWarning,
        useMemoWarning,
        useCallbackWarning,
        namespaceImportWarning,
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'max-depth': 'off',
      'max-lines': 'off',
      'custom-size/limit-logic-function-lines': 'off',
      'custom-jsdoc/require-jsdoc-complexity': 'off',
      // Tests often need module-shaped imports for partial mocks and importOriginal() typing.
      'no-restricted-syntax': [
        'warn',
        useEffectWarning,
        useStateWarning,
        useMemoWarning,
        useCallbackWarning,
      ],
    },
  },
  // Disable useState warning for UI/shared components (they legitimately use local state)
  {
    files: [
      '**/ui/**/*.{ts,tsx}',
      '**/shared/**/*.{ts,tsx}',
      '**/components/ui/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        useEffectWarning,
        useMemoWarning,
        useCallbackWarning,
        namespaceImportWarning,
      ],
    },
  },
  // Context providers often need stable value/callback identities for provider boundaries.
  {
    files: ['**/*Context*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        useEffectWarning,
        useStateWarning,
        namespaceImportWarning,
      ],
    },
  },
  {
    files: ['src/features/ExaminationGraph/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        useEffectWarning,
        useMemoWarning,
        useCallbackWarning,
        noPayloadsCollectionPropWarning,
        noPayloadsCollectionPropTypeWarning,
        noUseLiveQueryDepsWarning,
      ],
    },
  },
  // JSDoc requirements based on cognitive complexity for TSX files
  {
    files: ['**/*.tsx'],
    ignores: ['src/components/ui/**/*', '**/*.test.tsx', '**/*.spec.tsx'],
    rules: {
      'custom-jsdoc/require-jsdoc-complexity': [
        'error',
        {
          complexityThreshold: 80,
          includeArrowFunctions: true,
          includeFunctionDeclarations: true,
          includeFunctionExpressions: true,
          includeMethodDefinitions: true,
          ignoreAnonymousFunctions: true,
        },
      ],
      'custom-recursion/require-jsdoc-recursion': 'error',
    },
  },
  // JSDoc requirements based on cognitive complexity for TS files
  {
    files: ['**/*.ts'],
    ignores: [
      'src/generated/**/*',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.d.ts',
    ],
    rules: {
      'custom-jsdoc/require-jsdoc-complexity': [
        'error',
        {
          complexityThreshold: 80,
          includeArrowFunctions: true,
          includeFunctionDeclarations: true,
          includeFunctionExpressions: true,
          includeMethodDefinitions: true,
          ignoreAnonymousFunctions: true,
        },
      ],
      'custom-recursion/require-jsdoc-recursion': 'error',
    },
  },
];
