import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../../../common/events/event.contants';
import { OutboxWriter } from '../outbox/outbox-writer.service';
import {
  EVT_PAGE_STATUS_CHANGED,
  EVT_COMMENT_CREATED,
  EVT_COMMENT_UPDATED,
  EVT_COMMENT_DELETED,
  EVT_COMMENT_RESOLVED,
  EVT_ATTACHMENT_CREATED,
  EVT_ATTACHMENT_DELETED,
  EVT_WORKSPACE_CREATED,
  EVT_WORKSPACE_UPDATED,
  EVT_WORKSPACE_DELETED,
  EVT_WORKSPACE_MEMBER_ADDED,
  EVT_WORKSPACE_MEMBER_ROLE_CHANGED,
  EVT_WORKSPACE_MEMBER_DEACTIVATED,
  EVT_WORKSPACE_MEMBER_DELETED,
  EVT_SPACE_CREATED,
  EVT_SPACE_UPDATED,
  EVT_SPACE_DELETED,
  EVT_SPACE_MEMBER_ADDED,
  EVT_SPACE_MEMBER_REMOVED,
  EVT_SPACE_MEMBER_ROLE_CHANGED,
  EVT_PAGE_CONTENT_UPDATED,
} from '../constants/orvex-event-types';

/**
 * ENG-1383 T3/T4 — replaces the lossy `EventEmitter2 → Redis XADD`
 * fire-and-forget path (AC4 — there is none of that path in this repo to
 * shadow; grep-gate for it stays green trivially, and this service is the
 * thing that would ever reintroduce it). Routes lifecycle domain events
 * through `OutboxWriter` so each produces its outbox row (AC7).
 *
 * `page.created` and `page.content_updated` on the PRIMARY REST create/write
 * path are enqueued in-transaction directly by `PageService` (AC1/AC2 need
 * the SAME transaction as the mutation, which a post-commit `@OnEvent`
 * listener structurally cannot provide — see `OutboxWriter.enqueue` vs
 * `enqueueDetached`). This bus service covers the broader lifecycle family
 * (AC7) plus `page.content_updated`'s changedBlockIds enrichment for
 * secondary emission paths (e.g. collab re-emit) via `enqueueDetached`.
 */
@Injectable()
export class OrvexEventBusService {
  private readonly logger = new Logger(OrvexEventBusService.name);

  /**
   * R6 (ported from orvexai/docmost@050187…): transient in-process store for
   * changedBlockIds emitted by the REST write path (PAGE_CONTENT_BLOCKS_CHANGED),
   * consumed by the next PAGE_CONTENT_UPDATED for the same pageId so the
   * outbox row's payload carries changedBlockIds through the collab
   * (BullMQ → EmbeddingProcessor re-emit) path (AC5/AC8).
   */
  private readonly pendingBlockDeltas = new Map<
    string,
    { ids: string[]; expiresAt: number }
  >();

  constructor(private readonly outboxWriter: OutboxWriter) {}

  @OnEvent(EventName.PAGE_CONTENT_BLOCKS_CHANGED)
  onPageContentBlocksChanged(event: {
    pageId: string;
    workspaceId: string;
    changedBlockIds: string[];
  }): void {
    const { pageId, changedBlockIds } = event;
    if (!pageId || !Array.isArray(changedBlockIds)) return;

    const now = Date.now();
    for (const [k, v] of this.pendingBlockDeltas) {
      if (v.expiresAt < now) this.pendingBlockDeltas.delete(k);
    }

    this.pendingBlockDeltas.set(pageId, {
      ids: changedBlockIds,
      expiresAt: now + 30_000,
    });
  }

  /**
   * AC8 — fired independently of the BullMQ→EmbeddingProcessor embed
   * re-emit, so deleting the embed pipeline does not drop content events.
   * The embed re-emit is one possible SOURCE of this event (collab path);
   * `PageService.updatePageContent` (REST path) also emits it directly.
   */
  @OnEvent(EventName.PAGE_CONTENT_UPDATED)
  async onPageContentUpdated(event: {
    pageId: string;
    workspaceId: string;
    changedBlockIds?: string[];
  }): Promise<void> {
    const { pageId, workspaceId } = event;
    if (!workspaceId || !pageId) return;

    let changedBlockIds: string[] | undefined;
    if (Array.isArray(event.changedBlockIds) && event.changedBlockIds.length > 0) {
      changedBlockIds = event.changedBlockIds;
    } else {
      const pending = this.pendingBlockDeltas.get(pageId);
      if (pending && pending.expiresAt > Date.now()) {
        changedBlockIds = pending.ids;
        this.pendingBlockDeltas.delete(pageId);
      }
    }

    const payload: Record<string, unknown> = { pageId, workspaceId };
    if (changedBlockIds !== undefined) {
      payload.changedBlockIds = changedBlockIds;
    }

    await this.outboxWriter.enqueueDetached({
      type: EVT_PAGE_CONTENT_UPDATED,
      aggregateId: pageId,
      workspaceId,
      payload,
    });
  }

  @OnEvent(EventName.PAGE_STATUS_CHANGED)
  async onPageStatusChanged(event: {
    pageId: string;
    workspaceId: string;
    spaceId?: string;
    fromStatus: string;
    toStatus: string;
  }): Promise<void> {
    const { pageId, workspaceId, spaceId, fromStatus, toStatus } = event;
    if (!workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_PAGE_STATUS_CHANGED,
      aggregateId: pageId,
      workspaceId,
      payload: { id: pageId, spaceId: spaceId ?? null, fromStatus, toStatus },
    });
  }

  @OnEvent(EventName.WORKSPACE_CREATED)
  async onWorkspaceCreated(event: { workspaceId: string }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_CREATED,
      aggregateId: event.workspaceId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.WORKSPACE_UPDATED)
  async onWorkspaceUpdated(event: { workspaceId: string }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_UPDATED,
      aggregateId: event.workspaceId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.WORKSPACE_DELETED)
  async onWorkspaceDeleted(event: { workspaceId: string }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_DELETED,
      aggregateId: event.workspaceId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.WORKSPACE_MEMBER_ADDED)
  async onWorkspaceMemberAdded(event: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_MEMBER_ADDED,
      aggregateId: event.userId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId, userId: event.userId },
    });
  }

  @OnEvent(EventName.WORKSPACE_MEMBER_ROLE_CHANGED)
  async onWorkspaceMemberRoleChanged(event: {
    workspaceId: string;
    userId: string;
    newRole: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_MEMBER_ROLE_CHANGED,
      aggregateId: event.userId,
      workspaceId: event.workspaceId,
      payload: {
        workspaceId: event.workspaceId,
        userId: event.userId,
        newRole: event.newRole,
      },
    });
  }

  @OnEvent(EventName.WORKSPACE_MEMBER_DEACTIVATED)
  async onWorkspaceMemberDeactivated(event: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_MEMBER_DEACTIVATED,
      aggregateId: event.userId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId, userId: event.userId },
    });
  }

  @OnEvent(EventName.WORKSPACE_MEMBER_DELETED)
  async onWorkspaceMemberDeleted(event: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_WORKSPACE_MEMBER_DELETED,
      aggregateId: event.userId,
      workspaceId: event.workspaceId,
      payload: { workspaceId: event.workspaceId, userId: event.userId },
    });
  }

  @OnEvent(EventName.SPACE_CREATED)
  async onSpaceCreated(event: {
    spaceId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!event.workspaceId || !event.spaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_CREATED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: { id: event.spaceId, workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.SPACE_UPDATED)
  async onSpaceUpdated(event: {
    spaceId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!event.workspaceId || !event.spaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_UPDATED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: { id: event.spaceId, workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.SPACE_DELETED)
  async onSpaceDeleted(event: {
    spaceId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_DELETED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: { id: event.spaceId, workspaceId: event.workspaceId },
    });
  }

  @OnEvent(EventName.SPACE_MEMBER_ADDED)
  async onSpaceMemberAdded(event: {
    userId: string;
    spaceId: string;
    workspaceId: string;
    role: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_MEMBER_ADDED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: {
        userId: event.userId,
        spaceId: event.spaceId,
        workspaceId: event.workspaceId,
        role: event.role,
      },
    });
  }

  @OnEvent(EventName.SPACE_MEMBER_REMOVED)
  async onSpaceMemberRemoved(event: {
    userId: string;
    spaceId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_MEMBER_REMOVED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: {
        userId: event.userId,
        spaceId: event.spaceId,
        workspaceId: event.workspaceId,
      },
    });
  }

  @OnEvent(EventName.SPACE_MEMBER_ROLE_CHANGED)
  async onSpaceMemberRoleChanged(event: {
    userId: string;
    spaceId: string;
    workspaceId: string;
    newRole: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_SPACE_MEMBER_ROLE_CHANGED,
      aggregateId: event.spaceId,
      workspaceId: event.workspaceId,
      payload: {
        userId: event.userId,
        spaceId: event.spaceId,
        workspaceId: event.workspaceId,
        newRole: event.newRole,
      },
    });
  }

  @OnEvent(EventName.COMMENT_CREATED)
  async onCommentCreated(event: {
    comment: { id: string };
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_COMMENT_CREATED,
      aggregateId: event.comment.id,
      workspaceId: event.workspaceId,
      payload: { ...event.comment, workspaceId: event.workspaceId, spaceId: event.spaceId },
    });
  }

  @OnEvent(EventName.COMMENT_UPDATED)
  async onCommentUpdated(event: {
    comment: { id: string };
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_COMMENT_UPDATED,
      aggregateId: event.comment.id,
      workspaceId: event.workspaceId,
      payload: { ...event.comment, workspaceId: event.workspaceId, spaceId: event.spaceId },
    });
  }

  @OnEvent(EventName.COMMENT_DELETED)
  async onCommentDeleted(event: {
    commentId: string;
    pageId: string;
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_COMMENT_DELETED,
      aggregateId: event.commentId,
      workspaceId: event.workspaceId,
      payload: {
        id: event.commentId,
        pageId: event.pageId,
        workspaceId: event.workspaceId,
        spaceId: event.spaceId,
      },
    });
  }

  @OnEvent(EventName.COMMENT_RESOLVED)
  async onCommentResolved(event: {
    comment: { id: string };
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_COMMENT_RESOLVED,
      aggregateId: event.comment.id,
      workspaceId: event.workspaceId,
      payload: { ...event.comment, workspaceId: event.workspaceId, spaceId: event.spaceId },
    });
  }

  @OnEvent(EventName.ATTACHMENT_CREATED)
  async onAttachmentCreated(event: {
    attachment: { id: string };
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_ATTACHMENT_CREATED,
      aggregateId: event.attachment.id,
      workspaceId: event.workspaceId,
      payload: { ...event.attachment, workspaceId: event.workspaceId, spaceId: event.spaceId },
    });
  }

  @OnEvent(EventName.ATTACHMENT_DELETED)
  async onAttachmentDeleted(event: {
    attachmentId: string;
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    if (!event.workspaceId) return;
    await this.outboxWriter.enqueueDetached({
      type: EVT_ATTACHMENT_DELETED,
      aggregateId: event.attachmentId,
      workspaceId: event.workspaceId,
      payload: {
        id: event.attachmentId,
        workspaceId: event.workspaceId,
        spaceId: event.spaceId,
      },
    });
  }
}
