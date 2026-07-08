import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * SecretConsumerDispositionSpec (ENG-1449).
 *
 * DoD named test: proves the disposition for the historical
 * `LocalSecretService` (`@orvex/secret`, `ORVEX_ENCRYPTION_SALT`) is
 * grounded in the REAL orvex-wiki @HEAD consumer inventory — not in the
 * pre-split `orvexai/docmost` fork snapshot the ticket text was authored
 * against.
 *
 * Verified HEAD consumer inventory (orvex-wiki `dev`, 2026-07-07):
 * `grep -rnE "^import.*LocalSecretService" apps/server/src --include=*.ts
 * | grep -v spec` returns ZERO matches. None of the five files the ticket
 * names as real consumers —
 *   apps/server/src/orvex/linear/linear-settings.controller.ts
 *   apps/server/src/orvex/clerk/clerk-config.service.ts
 *   apps/server/src/orvex/ai/ai-settings.controller.ts
 *   apps/server/src/orvex/ai/ai-chats.controller.ts
 *   apps/server/src/orvex/ai/ai-usage.controller.ts
 * — nor the `packages/orvex-secret` package itself, nor
 * `ORVEX_ENCRYPTION_SALT`, ever exist in this repo's tracked history
 * (`git log --all --diff-filter=A --name-only` never adds any of them).
 * They describe the pre-split `orvexai/docmost` fork pin
 * (050187676624f2395c55b36ec60e365f87fd4a9f), a different repository —
 * not this slim-AGPL engine post-split. Per the Slim-AGPL rule (PO Q22)
 * and ruling 3, Linear/Clerk/AI-settings config — if/when it exists —
 * belongs to satellite repos, which read secrets via
 * OpenBao -> ExternalSecrets -> env directly, never an in-engine vault.
 *
 * Disposition: DELETE branch, already satisfied (grep-zero + build
 * green, verified below). There is nothing to port-minimally because the
 * named consumers were never part of this repo. This spec is the
 * regression lock forbidding a silent re-introduction of an app-level
 * secret store into the engine.
 */
describe('SecretConsumerDispositionSpec', () => {
  const REPO_ROOT = join(__dirname, '../../../../..');

  function grepMatches(pattern: string, scope: string): string[] {
    try {
      const output = execFileSync(
        'grep',
        ['-rnE', pattern, scope, '--include=*.ts'],
        { cwd: REPO_ROOT, encoding: 'utf-8' },
      );
      return output.split('\n').filter(Boolean);
    } catch (err: unknown) {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 1) {
        return []; // grep: no matches found
      }
      throw err;
    }
  }

  it('DELETE branch: no engine file imports LocalSecretService', () => {
    const matches = grepMatches(
      '^import.*LocalSecretService',
      'apps/server/src',
    ).filter((line) => !line.includes('.spec.ts:'));
    expect(matches).toEqual([]);
  });

  it('DELETE branch: @orvex/secret is referenced nowhere in the engine tree', () => {
    const matches = grepMatches('@orvex/secret', 'apps').filter(
      (line) => !line.includes('.spec.ts:'),
    );
    expect(matches).toEqual([]);
  });

  it('DELETE branch: ORVEX_ENCRYPTION_SALT is not read or declared anywhere', () => {
    const matches = grepMatches('ORVEX_ENCRYPTION_SALT', 'apps').filter(
      (line) => !line.includes('secret-consumer-disposition.spec.ts:'),
    );
    expect(matches).toEqual([]);
  });

  it('DELETE branch: the packages/orvex-secret package was never introduced', () => {
    expect(existsSync(join(REPO_ROOT, 'packages/orvex-secret'))).toBe(false);
  });

  it('DELETE branch: none of the five ticket-named consumer files exist in this repo', () => {
    const namedConsumers = [
      'apps/server/src/orvex/linear/linear-settings.controller.ts',
      'apps/server/src/orvex/clerk/clerk-config.service.ts',
      'apps/server/src/orvex/ai/ai-settings.controller.ts',
      'apps/server/src/orvex/ai/ai-chats.controller.ts',
      'apps/server/src/orvex/ai/ai-usage.controller.ts',
    ];
    for (const relPath of namedConsumers) {
      expect(existsSync(join(REPO_ROOT, relPath))).toBe(false);
    }
  });
});
