import tseslint from 'typescript-eslint';

/**
 * Repo-root BOUNDARY lint — the Foundation M1 import fences only.
 *
 * Style/correctness linting stays in each app's own eslint config
 * (apps/client/eslint.config.mjs, apps/server/eslint.config.mjs); this file is
 * the repo-wide import-boundary gate, run from the repo root:
 *
 *   pnpm lint:boundary
 *
 * Fences:
 *  1. Mock quarantine — delivery-path code never imports from
 *     design-artifacts/ (the reference-mock quarantine zone) and never imports
 *     fabricated-data generators (ALL-REAL, CS §11; mock boundaries, CS §5).
 *  2. AGPL import guard (A-BOUNDARY / A-SEAMS) — additive orvex code
 *     (apps/server/src/orvex/**, packages/@orvex/**) never statically imports
 *     @docmost/* or ee/*. The ONLY sanctioned ee reference is the try/catch
 *     dynamic require in orvex/boot/orvex-bootstrap.ts (a require() call,
 *     which this static-import rule deliberately does not match).
 */

const QUARANTINE_PATTERNS = [
  {
    group: ['**/design-artifacts/**'],
    message:
      'design-artifacts/ is the mock/reference quarantine zone — never imported by delivery-path code (Foundation M1; CS §11 ALL-REAL).',
  },
  {
    group: [
      '@faker-js/*',
      'faker',
      'faker/*',
      'casual',
      'casual/*',
      'chance',
      'chance/*',
    ],
    message:
      'No fabricated-data generators in the delivery path (CS §11 ALL-REAL). Tests replay committed real fixtures at true-external boundaries (CS §5).',
  },
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.nx/**',
      '.claude/**',
      '_bmad/**',
      '_bmad-output/**',
      'design-artifacts/**',
      'docs/**',
      'apps/client/public/**',
      'tests/**',
    ],
  },
  {
    files: ['apps/**/*.{ts,tsx,mts,cts}', 'packages/**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
    },
    linterOptions: {
      // The fence cannot be switched off by an inline comment, and upstream
      // files' disable-comments for rules this gate does not register are
      // ignored rather than erroring the gate.
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-restricted-imports': ['error', { patterns: QUARANTINE_PATTERNS }],
    },
  },
  {
    // AGPL boundary for the additive orvex trees (A-BOUNDARY #4; canon P10):
    // the same quarantine fences PLUS the @docmost/ee static-import ban and
    // the no-`any`-across-surfaces rule (CS ❌#12) for code we own.
    files: ['apps/server/src/orvex/**/*.ts', 'packages/@orvex/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'off',
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...QUARANTINE_PATTERNS,
            {
              group: ['@docmost/*'],
              message:
                'AGPL import-guard: orvex/* and @orvex/* never statically import @docmost/* (A-BOUNDARY; additive columns go through the single declaration-merge file, orvex/types).',
            },
            {
              group: ['**/ee/**'],
              message:
                'AGPL import-guard: no static ee/* imports (A-BOUNDARY). The optional try/catch dynamic require in orvex/boot/orvex-bootstrap.ts is the only sanctioned pattern.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
