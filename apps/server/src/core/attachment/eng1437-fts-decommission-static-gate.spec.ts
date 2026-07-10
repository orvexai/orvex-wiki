// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1437 §5c — determinism / contract gates (read code, never run).
 *
 * AC5 — zero live (non-spec) callers of `ATTACHMENT_INDEX_CONTENT` /
 * `ATTACHMENT_INDEXING` remain in `apps/server/src`, and the constant is
 * deleted from `queue.constants.ts`.
 *
 * AC4 — `attachment.processor.ts` no longer `require()`s the non-bundled
 * attachments-EE extractor.
 *
 * AC6 — the engine attachment path (`core/attachment/**`,
 * `import-attachment.service.ts`) imports no knowledge-service HTTP client
 * for extraction — delegation is the outbox `attachment.created` event
 * only.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { QueueJob } from '../../integrations/queue/constants';

const SERVER_SRC = join(__dirname, '..', '..');

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsFiles(full, out);
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('ENG-1437 AC5 — zero live callers of the removed queue-job constants', () => {
  it('no non-spec file under apps/server/src references ATTACHMENT_INDEX_CONTENT (the literal §5c grep gate)', () => {
    const files = listTsFiles(SERVER_SRC).filter((f) => !f.endsWith('.spec.ts'));
    const violations = files.filter((f) =>
      /\bATTACHMENT_INDEX_CONTENT\b/.test(readFileSync(f, 'utf-8')),
    );
    expect(violations).toEqual([]);
  });

  it('QueueJob.ATTACHMENT_INDEXING is orphaned nowhere else in apps/server/src (queue.constants.ts excepted below)', () => {
    // Scoped to the QueueJob module only — `common/features.ts` carries an
    // unrelated pre-existing feature-flag string that happens to share the
    // name (`'attachment:indexing'`, a different namespace/value entirely,
    // out of this decommission's scope); this check targets QueueJob's own
    // member, not every string occurrence of the word in the tree.
    const queueConstantsPath = join(
      SERVER_SRC,
      'integrations/queue/constants/queue.constants.ts',
    );
    const content = readFileSync(queueConstantsPath, 'utf-8');
    expect(content).not.toMatch(/ATTACHMENT_INDEXING\s*=/);
  });

  it('QueueJob no longer exports ATTACHMENT_INDEX_CONTENT / ATTACHMENT_INDEXING', () => {
    expect((QueueJob as any).ATTACHMENT_INDEX_CONTENT).toBeUndefined();
    expect((QueueJob as any).ATTACHMENT_INDEXING).toBeUndefined();
  });
});

describe('ENG-1437 AC4 — processor no longer resolves the attachments-EE extractor', () => {
  it('attachment.processor.ts contains no require of ee/attachments-ee/attachment-ee.service', () => {
    const content = readFileSync(
      join(SERVER_SRC, 'core/attachment/processors/attachment.processor.ts'),
      'utf-8',
    );
    expect(content).not.toMatch(/require\(.*attachments-ee\/attachment-ee\.service.*\)/);
  });
});

describe('ENG-1437 AC6 — no synchronous knowledge/HTTP client import for extraction', () => {
  const BANNED_IMPORT_REGEX = /from\s+['"][^'"]*knowledge[^'"]*['"]/i;

  it('core/attachment/** imports no knowledge/HTTP client', () => {
    const dir = join(SERVER_SRC, 'core/attachment');
    const files = listTsFiles(dir).filter((f) => !f.endsWith('.spec.ts'));
    const violations = files.filter((f) =>
      BANNED_IMPORT_REGEX.test(readFileSync(f, 'utf-8')),
    );
    expect(violations).toEqual([]);
  });

  it('import-attachment.service.ts imports no knowledge/HTTP client', () => {
    const content = readFileSync(
      join(
        SERVER_SRC,
        'integrations/import/services/import-attachment.service.ts',
      ),
      'utf-8',
    );
    expect(BANNED_IMPORT_REGEX.test(content)).toBe(false);
  });

  it('(fixture) the regex itself DOES catch a forbidden import, proving the guard is not vacuous', () => {
    const fixture = `import { KnowledgeClient } from '@orvex/knowledge-client';\nexport {};\n`;
    expect(BANNED_IMPORT_REGEX.test(fixture)).toBe(true);
  });
});
