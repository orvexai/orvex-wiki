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
 *    CAS-precheck-before-idempotency-CLAIM ordering as `PageService.update`
 *    (AC3). The idempotency slot is claimed (SET-NX write) AFTER the batch
 *    has been validated (applied in-memory + `jsonToNode`-checked), so a
 *    malformed batch 4xxs before any slot is taken — a same-key retry can
 *    never replay an unchanged page as a false success for a request that
 *    never actually got recorded (F1 honest-state fix). The line-85
 *    precheck is ADVISORY, not atomic — a concurrent writer can still bump
 *    the version between it and the CAS below, so the CAS itself can 409
 *    AFTER a slot has already been claimed. Fix pass 2 (review-2 finding):
 *    that path is wrapped so the slot is explicitly RELEASED
 *    (`IdempotencyStore.release`) on any transaction failure, never left
 *    pinned to `{pending:true}` for the retry to poll out to a fabricated
 *    false-success envelope.
 *
 *    Fix pass 3 (review-3 finding): the precheck-before-claim ordering
 *    above governs the CAS-precheck-before-idempotency-claim **WRITE**
 *    (SET-NX) — it says nothing about a recorded-result **READ**. AC3 also
 *    requires "identical keyed retry -> identical envelope both times",
 *    including for a retry that arrives AFTER the winner has committed
 *    (version already advanced) — standard idempotency-key semantics: a
 *    recorded response replays regardless of the resource's current state.
 *    So a READ-ONLY `IdempotencyStore.lookup()` runs BEFORE the line-~90
 *    precheck: if a settled (non-pending) result is already on record for
 *    this key, it is returned immediately, before the version is ever
 *    checked. This does not reopen the F1 hole above — `lookup()` never
 *    claims a slot and never observes a `{pending:true}` marker (that
 *    in-flight case still falls through to the precheck + `claim()`'s poll,
 *    unchanged from fix pass 1/2). Net effect: BOTH AC3 clauses hold
 *    simultaneously — a settled replay short-circuits the version check
 *    (satisfies "identical envelope both times"), while a fresh/stale
 *    request with no settled record still hits the precheck before ever
 *    taking a slot (satisfies "a 409 never poisons the slot").
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

    // ENG-1652 fix pass 3 (review-3 finding) — REPLAY LOOKUP, read-only,
    // BEFORE the CAS precheck below. A settled (non-pending) recorded
    // result for this exact (pageId, userId, idempotencyKey) replays
    // immediately, regardless of the current version — this is what makes
    // a keyed retry that arrives AFTER the winner has already committed
    // (and bumped the version) still return the SAME envelope instead of
    // 409ing at the version precheck. `lookup()` never claims a slot and
    // never surfaces a `{pending:true}` marker, so the still-in-flight
    // concurrent-duplicate window (both requests racing at the same
    // version) is untouched — it still falls through to the precheck and
    // `claim()`'s poll below, unchanged from fix passes 1/2.
    if (idempotencyKey) {
      const hit = await this.idempotencyStore.lookup<ApplyOpsSettledEnvelope>(
        'apply-ops',
        pageId,
        userId,
        idempotencyKey,
      );
      if (hit.recorded) {
        return hit.result!;
      }
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

    let claimedSlot = false;
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
      claimedSlot = true;
    }

    const expectedVersion = isIntegerVersion(dto.ifVersion)
      ? toIntegerVersion(dto.ifVersion)
      : (meta?.version ?? 1);

    try {
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
    } catch (err) {
      // ENG-1652 fix pass 2 (AC3 poisoning): a claimed slot that never
      // reaches `record()` — e.g. because a concurrent writer bumped the
      // version between the line-85 precheck and this CAS, so the atomic
      // guard 409s AFTER the slot was already taken — must be released here.
      // Otherwise the slot sits pinned to `{pending:true}` for the full TTL
      // and a same-key retry polls out to `claim.result === undefined`,
      // falling through to `readSettledEnvelope` (line ~128 above) and
      // returning the CONCURRENT WRITER's state as a fabricated 200
      // false-success — silently dropping this request's ops (ruling-5,
      // AC6). Releasing lets the retry claim the (now-free) slot afresh and
      // genuinely re-attempt the write instead of replaying a stale ghost.
      if (claimedSlot && idempotencyKey) {
        await this.idempotencyStore.release(
          'apply-ops',
          pageId,
          userId,
          idempotencyKey,
        );
      }
      throw err;
    }

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
