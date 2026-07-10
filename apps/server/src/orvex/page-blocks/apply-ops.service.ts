// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { jsonToNode, jsonToText, stampBlockIds } from 'src/collaboration/collaboration.util';
import { createYdocFromJson, getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { computeContentHash } from '../../common/helpers/content-hash';
import { IdempotencyStore } from '../../integrations/redis/idempotency-store.service';
import {
  assertIfVersionMatches,
  isIntegerVersion,
  toIntegerVersion,
} from '../../core/page/if-version.util';
import { applyOpsBatch, PmOpInput } from './apply-ops-batch.util';
import { ApplyOpsError } from './apply-ops.errors';

export interface ApplyOpsSettledEnvelope {
  version: number;
  settledUpdatedAt: string;
  contentHash: string | null;
}

/**
 * ENG-1652 — the apply-ops HTTP write primitive's orchestrator.
 *
 * Composes THREE existing chokepoints rather than re-deriving them (CS §7
 * one-adapter rule):
 *  - the ordered op grammar (`apply-ops-batch.util.ts`, this ticket) — pure,
 *    in-memory, never touches the DB, so a mid-batch failure (AC2/AC4)
 *    literally cannot have written anything yet;
 *  - the ENG-1397 block-ID chokepoint semantics (`jsonToNode` validation +
 *    `stampBlockIds`) — re-used directly, not re-implemented, so this write
 *    path can never mint ids differently than `PageService`'s;
 *  - the ENG-1413 CAS/idempotency primitive (`if-version.util` +
 *    `PageRepo.casIncrementMeta` + `IdempotencyStore`) — the same
 *    CAS-precheck-before-idempotency-claim ordering as `PageService.update`
 *    (AC3). The idempotency slot is claimed AFTER the batch has been
 *    validated (applied in-memory + `jsonToNode`-checked), so a malformed
 *    batch 4xxs before any slot is taken — a same-key retry can never
 *    replay an unchanged page as a false success for a request that never
 *    actually got recorded (F1 honest-state fix).
 *
 * AC2 (single-transact all-or-nothing): the batch is fully applied against
 * an in-memory clone BEFORE any transaction opens. The one transaction that
 * *does* open contains exactly one `casIncrementMeta` (the CAS guard) and
 * one `PageRepo.updatePage({content...})` call (the chokepoint write) — if
 * either fails, the whole transaction rolls back and the persisted doc is
 * byte-identical to pre-batch.
 */
@Injectable()
export class ApplyOpsService {
  constructor(
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly idempotencyStore: IdempotencyStore,
  ) {}

  async applyOps(
    pageId: string,
    workspaceId: string,
    userId: string,
    dto: { ifVersion: number; ops: PmOpInput[] },
    idempotencyKey?: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const page = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    const meta = await this.pageRepo.getPageMeta(pageId);

    // AC3: the CAS precondition is asserted BEFORE any idempotency slot is
    // claimed — a stale ifVersion 409s here, leaving the slot free for a
    // legitimate retry with the correct version.
    assertIfVersionMatches(page.updatedAt, dto.ifVersion, meta?.version);

    // AC2/AC4: apply the WHOLE batch in memory first. Any op failure throws
    // here — before a single row has been touched, AND before the
    // idempotency slot below is claimed. Claiming a slot for a batch that
    // never gets `record()`-ed (because it 4xx'd) would let a same-key
    // retry replay the page's UNCHANGED state as a false success envelope,
    // masking the original error (F1 honest-state fix) — so a bad-op batch
    // must throw here, before any slot is taken.
    let workingDoc: unknown;
    try {
      workingDoc = applyOpsBatch(getProsemirrorContent(page.content), dto.ops);
    } catch (err) {
      if (err instanceof ApplyOpsError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }

    try {
      jsonToNode(workingDoc as any);
    } catch {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FORMAT' });
    }

    // ENG-1397 chokepoint semantics — stamp any missing block ids (existing
    // ids are never regenerated, so this is a no-op for already-stamped
    // content).
    const { content: stamped } = stampBlockIds(workingDoc as any);
    const textContent = jsonToText(stamped as any);
    const ydoc = createYdocFromJson(stamped);
    const contentHash = computeContentHash(stamped);

    if (idempotencyKey) {
      const claim = await this.idempotencyStore.claim<ApplyOpsSettledEnvelope>(
        'apply-ops',
        pageId,
        userId,
        idempotencyKey,
      );
      if (!claim.claimed) {
        // AC3: the loser does not re-apply — return the winner's recorded
        // envelope (or, if it hasn't landed yet, the page's current state).
        return claim.result ?? (await this.readSettledEnvelope(pageId));
      }
    }

    const expectedVersion = isIntegerVersion(dto.ifVersion)
      ? toIntegerVersion(dto.ifVersion)
      : (meta?.version ?? 1);

    await executeTx(this.db, async (trx) => {
      // AC2: exactly ONE CAS guard for the whole batch.
      const cas = await this.pageRepo.casIncrementMeta(
        pageId,
        expectedVersion,
        { contentHash },
        trx,
      );
      if (!cas) {
        throw new ConflictException({ code: 'VERSION_MISMATCH' });
      }

      // AC2: exactly ONE chokepoint write for the whole batch — content,
      // textContent and ydoc all land in the SAME transaction/statement as
      // the CAS guard above (never a partial write on rollback).
      await this.pageRepo.updatePage(
        {
          content: stamped as any,
          textContent,
          ydoc,
          lastUpdatedById: userId,
        },
        pageId,
        trx,
      );
    });

    return this.readSettledEnvelope(pageId, contentHash, idempotencyKey, userId);
  }

  /**
   * AC5 — the settled read-your-writes envelope, sourced via a FRESH
   * post-commit read of both `orvex_page_meta` (ruling 4: version +
   * contentHash) and the page row itself (`updatedAt`) — never a
   * possibly-stale in-memory value computed before the write landed. When
   * `idempotencyKey` is supplied this also best-effort records the envelope
   * so a keyed retry replays the same result without re-applying.
   */
  private async readSettledEnvelope(
    pageId: string,
    knownContentHash?: string,
    idempotencyKey?: string,
    userId?: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const [fresh, page] = await Promise.all([
      this.pageRepo.getPageMeta(pageId),
      this.pageRepo.findById(pageId),
    ]);
    const envelope: ApplyOpsSettledEnvelope = {
      version: fresh?.version ?? 1,
      settledUpdatedAt: (page?.updatedAt ?? new Date()).toISOString(),
      contentHash: fresh?.contentHash ?? knownContentHash ?? null,
    };

    if (idempotencyKey && userId) {
      await this.idempotencyStore.record(
        'apply-ops',
        pageId,
        userId,
        idempotencyKey,
        envelope,
      );
    }

    return envelope;
  }
}
