import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page } from '@docmost/db/types/entity.types';
import { OrvexAuditService } from '../../core/audit/orvex-audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  markAiChangedBlocks,
  stripAiAuthoredMarks,
} from './provenance-content.util';

/**
 * The set of provenance states a page can carry.
 *
 *  - `ai_produced`    — the page was created in full by an AI/agent path
 *                       (this INCLUDES any REST-API write, per ruling 10 —
 *                       "any content written through the REST API is
 *                       AI-created").
 *  - `ai_edited`      — a human-authored (or mixed) page received an AI
 *                       edit; the AI-touched blocks are marked.
 *  - `human_verified` — a human explicitly verified the page; AI-authored
 *                       marks are stripped. ONLY reachable via the human
 *                       {@link OrvexPageProvenanceService.verify} path —
 *                       never settable by an AI/agent (AC3).
 *  - `null`           — provenance unstamped / cleared (no AI involvement
 *                       recorded).
 */
export type ProvenanceStatus =
  | 'ai_produced'
  | 'ai_edited'
  | 'human_verified'
  | null;

/**
 * The subset of provenance states an AI/agent path may assert. Deliberately
 * EXCLUDES `human_verified` — that certification can only originate from a
 * human session through {@link OrvexPageProvenanceService.verify}.
 */
export type AgentSettableProvenanceStatus = 'ai_produced' | 'ai_edited' | null;

/**
 * Caller identity threaded into provenance writes.
 *
 * `isHuman` distinguishes a human editor-session write from a
 * system/agent/REST-API write, so the audit row can attribute the change
 * correctly. For the AI write paths (markAiCreated / applyAiEdit) the
 * change is system-attributed (`provenanceChangedById = null`).
 */
export interface ProvenanceActor {
  userId: string | null;
  workspaceId: string;
  spaceId?: string;
  isHuman: boolean;
}

@Injectable()
export class OrvexPageProvenanceService {
  private readonly logger = new Logger(OrvexPageProvenanceService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly auditService: OrvexAuditService,
  ) {}

  /**
   * AI-created page (system/agent/REST-API path). Sets `ai_produced` with a
   * null actor (system/AI) — see {@link ProvenanceActor}.
   */
  async markAiCreated(
    pageId: string,
    actor: ProvenanceActor,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const page = await this.loadPage(pageId, actor.workspaceId, trx);

    await this.writeStatus(
      pageId,
      'ai_produced',
      null,
      page,
      { reason: 'ai_created' },
      actor.workspaceId,
      trx,
    );
  }

  /**
   * Apply an AI edit to a page.
   *
   * Locked decision (AC2): if the page is ALREADY `ai_produced`, an AI
   * re-edit leaves it `ai_produced` and does NOT re-mark blocks — the page
   * never had human authorship to distinguish. We return the new JSON
   * untouched and signal that the status row was not changed.
   *
   * Otherwise the AI-changed blocks are marked (so the editor can render the
   * "AI edited" affordance) and the status flips to `ai_edited`.
   *
   * NOTE: this method does NOT persist page CONTENT. It persists only the
   * provenance status row and returns the (possibly marked) JSON for the
   * caller to persist through the existing content path.
   */
  async applyAiEdit(
    pageId: string,
    oldDocJson: any,
    newDocJson: any,
    actor: ProvenanceActor,
    trx?: KyselyTransaction,
  ): Promise<{ contentJson: any; statusChanged: boolean }> {
    const page = await this.loadPage(pageId, actor.workspaceId, trx);

    // AI re-editing an already-ai_produced page stays ai_produced: no status
    // change, no mark pass, content returned unchanged.
    if (page.provenanceStatus === 'ai_produced') {
      return { contentJson: newDocJson, statusChanged: false };
    }

    const marked = markAiChangedBlocks(oldDocJson, newDocJson);

    await this.writeStatus(
      pageId,
      'ai_edited',
      null,
      page,
      { reason: 'ai_edited' },
      actor.workspaceId,
      trx,
    );

    return { contentJson: marked, statusChanged: true };
  }

  /**
   * Human verification of a page (AC3 — the ONLY path that can set
   * `human_verified`).
   *
   * Strips AI-authored marks from the supplied content and flips provenance
   * to `human_verified`, attributing the change to the verifying human. The
   * CALLER persists the returned stripped content through the normal
   * content path; this method persists only the status row.
   *
   * CASL (writer+) is enforced in the CONTROLLER, not here, so the service
   * can be reused by other server-internal callers that have already
   * authorized.
   */
  async verify(
    pageId: string,
    user: { id: string; workspaceId: string },
    currentContentJson: any,
    trx?: KyselyTransaction,
  ): Promise<{ contentJson: any }> {
    const page = await this.loadPage(pageId, user.workspaceId, trx);

    const stripped = stripAiAuthoredMarks(currentContentJson);

    await this.writeStatus(
      pageId,
      'human_verified',
      user.id,
      page,
      { reason: 'human_verified' },
      user.workspaceId,
      trx,
      user.id,
    );

    return { contentJson: stripped };
  }

  /**
   * Set provenance from an AI/agent path (used by a future `set_page_provenance`
   * MCP tool).
   *
   * Hard guard (AC3): `human_verified` can NEVER be set here — an AI/agent
   * path must not be able to self-certify a page as human-verified. Any
   * value other than `ai_produced | ai_edited | null` is rejected with 400.
   */
  async setFromAgent(
    pageId: string,
    status: AgentSettableProvenanceStatus,
    actor: ProvenanceActor,
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (status !== 'ai_produced' && status !== 'ai_edited' && status !== null) {
      throw new BadRequestException(
        'human_verified can only be set via human verification',
      );
    }

    const page = await this.loadPage(pageId, actor.workspaceId, trx);

    await this.writeStatus(
      pageId,
      status,
      null,
      page,
      { reason: 'set_by_agent' },
      actor.workspaceId,
      trx,
    );
  }

  async getProvenance(
    pageId: string,
    workspaceId: string,
  ): Promise<{
    provenanceStatus: ProvenanceStatus;
    provenanceChangedAt: Date | null;
    provenanceChangedById: string | null;
  }> {
    const page = await this.loadPage(pageId, workspaceId);
    return {
      provenanceStatus: (page.provenanceStatus ?? null) as ProvenanceStatus,
      provenanceChangedAt: page.provenanceChangedAt ?? null,
      provenanceChangedById: page.provenanceChangedById ?? null,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Loads the page (scoped to the workspace) and returns it, augmented with
   * its current provenance status resolved via the `orvex_page_meta`
   * side-table join (ENG-1603 — the trio no longer lives on `pages`). Throws
   * 404 when the page does not exist / is not in the caller's workspace.
   */
  private async loadPage(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<
    Page & {
      provenanceStatus: ProvenanceStatus;
      provenanceChangedAt: Date | null;
      provenanceChangedById: string | null;
    }
  > {
    const page = await this.pageRepo.findById(pageId, { trx });
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND', pageId });
    }

    const db = trx ?? this.db;
    const meta = await db
      .selectFrom('orvexPageMeta')
      .select([
        'provenanceStatus',
        'provenanceChangedAt',
        'provenanceChangedById',
      ])
      .where('pageId', '=', pageId)
      .executeTakeFirst();

    return {
      ...page,
      provenanceStatus: (meta?.provenanceStatus ?? null) as ProvenanceStatus,
      provenanceChangedAt: meta?.provenanceChangedAt ?? null,
      provenanceChangedById: meta?.provenanceChangedById ?? null,
    };
  }

  /**
   * Centralizes the provenance row upsert + audit emission so every public
   * method stays DRY and consistent. Runs the `orvex_page_meta` upsert AND
   * the audit write in the SAME transaction (AC1/AC4 — exactly one audit
   * event per stamp, atomic with the write — no lag window). ENG-1603:
   * the trio is upserted into `orvex_page_meta` (not `pages`).
   */
  private async writeStatus(
    pageId: string,
    status: ProvenanceStatus,
    changedById: string | null,
    page: { provenanceStatus?: string | null; spaceId: string },
    metadata: Record<string, unknown>,
    workspaceId: string,
    trx?: KyselyTransaction,
    actorId?: string | null,
  ): Promise<void> {
    const before = (page.provenanceStatus ?? null) as ProvenanceStatus;

    const run = async (tx: KyselyTransaction) => {
      await tx
        .insertInto('orvexPageMeta')
        .values({
          pageId,
          workspaceId,
          provenanceStatus: status,
          provenanceChangedAt: new Date(),
          provenanceChangedById: changedById,
        } as any)
        .onConflict((oc) =>
          oc.column('pageId').doUpdateSet({
            provenanceStatus: status,
            provenanceChangedAt: new Date(),
            provenanceChangedById: changedById,
            updatedAt: new Date(),
          } as any),
        )
        .execute();

      await this.auditService.logAndCommit(tx, {
        event: AuditEvent.PAGE_PROVENANCE_CHANGED,
        resourceType: AuditResource.PAGE,
        resourceId: pageId,
        actorId: actorId ?? changedById ?? undefined,
        actorType: actorId || changedById ? 'user' : 'system',
        workspaceId,
        spaceId: page.spaceId,
        changes: {
          before: { provenanceStatus: before },
          after: { provenanceStatus: status },
        },
        metadata,
      });
    };

    if (trx) {
      await run(trx);
    } else {
      await this.db.transaction().execute(run);
    }
  }
}
