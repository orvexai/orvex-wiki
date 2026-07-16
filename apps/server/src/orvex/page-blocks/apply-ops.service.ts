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
import type { JSONContent } from '@tiptap/core';
import { PageRepo } from '../../database/repos/page/page.repo';
import { KyselyDB } from '../../database/types/kysely.types';
import { executeTx } from '../../database/utils';
import type { Json } from '../../database/types/db';
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
    dto: { ifVersion?: number; ops: PmOpInput[] },
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

    return this.commitWorkingDoc(
      page,
      workingDoc as JSONContent,
      dto.ifVersion,
      meta,
      'apply-ops',
      idempotencyKey,
      userId,
    );
  }

  /**
   * Whole-doc apply-ops-on-an-EXISTING-document (amazing-MCP primitive #1) —
   * the engine leg wiki-api's `PUT /v1/wiki/{loc}` (save_page update/upsert)
   * composes over. The block-patch chokepoint above edits INDIVIDUAL blocks;
   * this replaces / appends / prepends the page's WHOLE root document in one
   * shot, under the SAME integer CAS (`ifVersion` → `orvex_page_meta.version`)
   * + idempotency + read-after-write settled-envelope machinery
   * (`commitWorkingDoc`) — never the collaboration/Yjs live-editor path, and
   * never a second write primitive. The incoming `document` is a full
   * ProseMirror-JSON doc (wiki-api converts DfM/Markdown → PM server-side
   * before calling); `writeOperation` picks the merge:
   *   - `replace` — the incoming doc becomes the page's whole body;
   *   - `append`  — the incoming doc's top-level blocks are appended after the
   *                 existing body;
   *   - `prepend` — …prepended before it.
   * The merged doc runs the exact same `.check()` content-model validation +
   * `stampBlockIds` chokepoint as a block batch, so an invalid whole-doc write
   * 400s before any row is touched (never a crash, never a partial write).
   */
  async applyDocument(
    pageId: string,
    workspaceId: string,
    userId: string,
    dto: {
      ifVersion?: number;
      document: JSONContent;
      writeOperation?: 'replace' | 'append' | 'prepend';
    },
    idempotencyKey?: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const page = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    // Settled-replay lookup BEFORE the CAS precheck — a keyed retry that
    // arrives after the winner committed replays the same receipt instead of
    // 409ing at the (now-advanced) version. Mirrors `applyOps` exactly (fix
    // pass 3), under a DISTINCT idempotency namespace so a whole-doc write and
    // a block batch reusing the same key never cross-replay.
    if (idempotencyKey) {
      const hit = await this.idempotencyStore.lookup<ApplyOpsSettledEnvelope>(
        'apply-doc',
        pageId,
        userId,
        idempotencyKey,
      );
      if (hit.recorded) {
        return hit.result!;
      }
    }

    const meta = await this.pageRepo.getPageMeta(pageId);
    assertIfVersionMatches(page.updatedAt, dto.ifVersion, meta?.version);

    const operation = dto.writeOperation ?? 'replace';
    const incoming = dto.document ?? {};
    const incomingBlocks = Array.isArray(incoming.content)
      ? incoming.content
      : [];

    let workingDoc: JSONContent;
    if (operation === 'replace') {
      workingDoc = incoming;
    } else {
      const existing = getProsemirrorContent(page.content) as JSONContent;
      const existingBlocks = Array.isArray(existing?.content)
        ? existing.content
        : [];
      workingDoc = {
        ...(existing ?? { type: 'doc' }),
        content:
          operation === 'append'
            ? [...existingBlocks, ...incomingBlocks]
            : [...incomingBlocks, ...existingBlocks],
      };
    }

    return this.commitWorkingDoc(
      page,
      workingDoc,
      dto.ifVersion,
      meta,
      'apply-doc',
      idempotencyKey,
      userId,
    );
  }

  /**
   * The shared commit tail for BOTH the block-batch (`applyOps`) and the
   * whole-doc (`applyDocument`) primitives (CS §7 one-adapter): schema
   * validation, block-id stamping, the idempotency claim, the single atomic
   * CAS-guarded chokepoint write, slot-release-on-failure, and the settled
   * read-after-write envelope — one place, so the two write shapes can never
   * drift in their CAS/idempotency/persistence semantics.
   */
  private async commitWorkingDoc(
    page: { id: string; workspaceId: string },
    workingDoc: JSONContent,
    ifVersion: number | undefined,
    meta: { version: number } | undefined,
    namespace: 'apply-ops' | 'apply-doc',
    idempotencyKey: string | undefined,
    userId: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const pageId = page.id;

    // `jsonToNode` alone is NOT a genuine content-model validator — it
    // resolves to ProseMirror's unchecked `Node.fromJSON`, which happily
    // constructs a tree whose content doesn't fit its own type's content
    // expression and returns successfully; that invalid tree would then crash
    // uncaught deep inside `stampBlockIds`. `.check()` runs the SAME recursive
    // content/attrs/marks validation ProseMirror itself runs internally, so a
    // malformed doc 400s HERE, before a single row is touched.
    try {
      jsonToNode(workingDoc).check();
    } catch {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FORMAT' });
    }

    // ENG-1397 chokepoint semantics — stamp any missing block ids (existing
    // ids are never regenerated, so this is a no-op for already-stamped
    // content).
    const { content: stamped } = stampBlockIds(workingDoc);
    const textContent = jsonToText(stamped);
    const ydoc = createYdocFromJson(stamped);
    const contentHash = computeContentHash(stamped);

    let claimedSlot = false;
    if (idempotencyKey) {
      const claim = await this.idempotencyStore.claim<ApplyOpsSettledEnvelope>(
        namespace,
        pageId,
        userId,
        idempotencyKey,
      );
      if (!claim.claimed) {
        // The loser does not re-apply — return the winner's recorded envelope
        // (or, if it hasn't landed yet, the page's current state).
        return claim.result ?? (await this.readSettledEnvelope(pageId));
      }
      claimedSlot = true;
    }

    const expectedVersion = isIntegerVersion(ifVersion)
      ? toIntegerVersion(ifVersion)
      : (meta?.version ?? 1);

    try {
      await executeTx(this.db, async (trx) => {
        // Exactly ONE CAS guard for the whole write.
        const cas = await this.pageRepo.casIncrementMeta(
          pageId,
          expectedVersion,
          { contentHash },
          page.workspaceId,
          trx,
        );
        if (!cas) {
          throw new ConflictException({ code: 'VERSION_MISMATCH' });
        }

        // Exactly ONE chokepoint write — content, textContent and ydoc all
        // land in the SAME transaction as the CAS guard (never a partial
        // write on rollback).
        await this.pageRepo.updatePage(
          {
            content: stamped as unknown as Json,
            textContent,
            ydoc,
            lastUpdatedById: userId,
          },
          pageId,
          trx,
        );
      });
    } catch (err) {
      // A claimed slot that never reaches `record()` (e.g. the CAS 409s after
      // the slot was taken) must be released, or a same-key retry polls out to
      // a fabricated false-success from the concurrent writer's state.
      if (claimedSlot && idempotencyKey) {
        await this.idempotencyStore.release(
          namespace,
          pageId,
          userId,
          idempotencyKey,
        );
      }
      throw err;
    }

    return this.readSettledEnvelope(
      pageId,
      contentHash,
      idempotencyKey,
      userId,
      namespace,
    );
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
    namespace: 'apply-ops' | 'apply-doc' = 'apply-ops',
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
        namespace,
        pageId,
        userId,
        idempotencyKey,
        envelope,
      );
    }

    return envelope;
  }
}
