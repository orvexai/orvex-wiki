// Integration-test jest config (ENG-1385). Identical to the unit config in
// package.json except it whitelists the ESM-only packages pulled in by a
// full AppModule bootstrap for transformation. Scoped to *.itest.ts only --
// it is never referenced by `make test-server` / `pnpm test:ci`, so it
// cannot loosen the default unit-test transform surface.
const path = require('path');
const baseJestConfig = require('../package.json').jest;

module.exports = {
  ...baseJestConfig,
  rootDir: path.join(__dirname, '..', 'src'),
  testRegex: '.*\\.itest\\.ts$',
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.pnpm/)?(nanoid|uuid|image-dimensions|marked|happy-dom|lib0|jose|@sindresorhus\\+[^/]+|@sindresorhus/[^/]+|escape-string-regexp|ansi-regex|ansi-styles)(@|/))',
  ],
};
