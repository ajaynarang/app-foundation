// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // `any` is used intentionally in many adapters/formatters that
      // traverse deeply-nested Prisma relations. The `no-unsafe-*` family
      // triggers tens of thousands of warnings that don't flag real bugs —
      // rely on TypeScript's own type-checker (tsc --noEmit) instead.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Still useful — these catch real bugs.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      'no-unused-vars': 'off',
      'no-useless-escape': 'warn',
      'prettier/prettier': ['warn', { endOfLine: 'auto', singleQuote: true }],
      // Two guards in one rule:
      //
      // 1. Bridge-only — domain code MUST emit DomainEvents and let
      //    DomainEventSseBridge route them. Direct SseService usage is
      //    unblocked inside infrastructure/sse/ (the override below).
      //
      // 2. Cache facade — `@nestjs/cache-manager` and the legacy
      //    cache-manager adapter packages are banned. Every cache read/write
      //    must go through SallyCacheService (which sits on a single ioredis
      //    client). See .docs/plans/10-platform/2026-05-27-cache-unify-on-ioredis.md
      //    for the incident that motivated this guard. Plans drift; lint doesn't.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/cache-manager',
              message:
                'Banned. Inject SallyCacheService instead. See .docs/plans/10-platform/2026-05-27-cache-unify-on-ioredis.md',
            },
            {
              name: 'cache-manager',
              message:
                'Banned. Inject SallyCacheService instead. See .docs/plans/10-platform/2026-05-27-cache-unify-on-ioredis.md',
            },
            {
              name: 'cache-manager-redis-yet',
              message: 'Removed dep. Use SallyCacheService.',
            },
            {
              name: 'cache-manager-ioredis',
              message: 'Removed dep. Use SallyCacheService.',
            },
          ],
          patterns: [
            {
              group: ['**/infrastructure/sse/sse.service'],
              importNames: ['SseService'],
              message:
                'SseService is bridge-internal. Emit a DomainEvent via EventEmitter2 and let DomainEventSseBridge route it. See infrastructure/sse/domain-event-sse-bridge.service.ts.',
            },
          ],
        },
      ],
    },
  },
  // Bridge implementation needs to import SseService — turn the rule off here.
  {
    files: ['src/infrastructure/sse/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Tower SSE subscriber is the documented complex-formatting counterpart to
  // DomainEventSseBridge: it consumes domain events and emits formatted
  // WireItems — formatting the 1:1 bridge can't do — so it reaches SseService
  // directly. See the file header for why it lives in the domain.
  {
    files: [
      'src/domains/operations/command-center/services/tower-sse.subscriber.ts',
      'src/domains/operations/command-center/services/__tests__/tower-sse.subscriber.spec.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Tests use mocks and dynamic fixtures; relax the noisiest rules.
  {
    files: [
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
      '**/__tests__/**/*.ts',
      'test/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
);
