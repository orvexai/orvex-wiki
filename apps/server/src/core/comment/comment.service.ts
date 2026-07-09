import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateCommentDto, yjsSelectionSchema } from './dto/create-comment.dto';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { Comment, Page, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { extractUserMentionIdsFromJson } from '../../common/helpers/prosemirror/utils';
import { ICommentNotificationJob } from '../../integrations/queue/constants/queue.interface';
import { WsService } from '../../ws/ws.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import {
  EVT_COMMENT_CREATED,
  EVT_COMMENT_UPDATED,
  EVT_COMMENT_DELETED,
} from '../../orvex/events/constants/orvex-event-types';

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    private commentRepo: CommentRepo,
    private pageRepo: PageRepo,
    private wsService: WsService,
    private collaborationGateway: CollaborationGateway,
    @InjectQueue(QueueName.GENERAL_QUEUE)
    private generalQueue: Queue,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private notificationQueue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async findById(commentId: string) {
    const comment = await this.commentRepo.findById(commentId, {
      includeCreator: true,
      includeResolvedBy: true,
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  async create(
    opts: { page: Page; workspaceId: string; user: User },
    createCommentDto: CreateCommentDto,
  ) {
    const { page, workspaceId, user } = opts;
    const commentContent = JSON.parse(createCommentDto.content);

    if (createCommentDto.parentCommentId) {
      const parentComment = await this.commentRepo.findById(
        createCommentDto.parentCommentId,
      );

      if (!parentComment || parentComment.pageId !== page.id) {
        throw new BadRequestException('Parent comment not found');
      }

      if (parentComment.parentCommentId !== null) {
        throw new BadRequestException('You cannot reply to a reply');
      }
    }

    const inserted = await executeTx(this.db, async (trx) => {
      const row = await this.commentRepo.insertComment(
        {
          pageId: page.id,
          content: commentContent,
          selection: createCommentDto?.selection?.substring(0, 250) ?? null,
          type: createCommentDto.type ?? 'page',
          parentCommentId: createCommentDto?.parentCommentId,
          creatorId: user.id,
          workspaceId: workspaceId,
          spaceId: page.spaceId,
        },
        trx,
      );

      // ENG-1609 AC4 — comment.created, atomic in the same tx as the insert.
      await this.outboxWriter.enqueue(trx, {
        type: EVT_COMMENT_CREATED,
        aggregateId: row.id,
        workspaceId,
        payload: { id: row.id, pageId: page.id, workspaceId },
      });

      return row;
    });

    if (createCommentDto.yjsSelection) {
      const parsed = yjsSelectionSchema.safeParse(createCommentDto.yjsSelection);
      if (!parsed.success) {
        this.logger.warn(
          `Invalid yjsSelection for comment ${inserted.id}: ${parsed.error.message}`,
        );
      } else {
        const documentName = `page.${page.id}`;
        try {
          await this.collaborationGateway.handleYjsEvent(
            'setCommentMark',
            documentName,
            {
              yjsSelection: parsed.data,
              commentId: inserted.id,
              resolved: false,
              user,
            },
          );
        } catch (error) {
          this.logger.warn(
            `Failed to apply comment mark for comment ${inserted.id}, comment saved without inline highlight`,
            error,
          );
        }
      }
    }

    const comment = await this.commentRepo.findById(inserted.id, {
      includeCreator: true,
      includeResolvedBy: true,
    });

    this.generalQueue
      .add(QueueJob.ADD_PAGE_WATCHERS, {
        userIds: [user.id],
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId,
      })
      .catch((err) =>
        this.logger.warn(`Failed to queue add-page-watchers: ${err.message}`),
      );

    const isReply = !!createCommentDto.parentCommentId;

    await this.queueCommentNotification(
      commentContent,
      [],
      comment.id,
      page.id,
      page.spaceId,
      workspaceId,
      user.id,
      !isReply,
      createCommentDto.parentCommentId,
    );

    this.wsService.emitCommentEvent(page.spaceId, page.id, {
      operation: 'commentCreated',
      pageId: page.id,
      comment,
    });

    return comment;
  }

  async findByPageId(
    pageId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Comment>> {
    const page = await this.pageRepo.findById(pageId);

    if (!page) {
      throw new BadRequestException('Page not found');
    }

    return this.commentRepo.findPageComments(pageId, pagination);
  }

  async update(
    comment: Comment,
    updateCommentDto: UpdateCommentDto,
    authUser: User,
  ): Promise<Comment> {
    const commentContent = JSON.parse(updateCommentDto.content);

    if (comment.creatorId !== authUser.id) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const oldMentionIds = extractUserMentionIdsFromJson(comment.content);

    const editedAt = new Date();

    await executeTx(this.db, async (trx) => {
      await this.commentRepo.updateComment(
        {
          content: commentContent,
          editedAt: editedAt,
          updatedAt: editedAt,
        },
        comment.id,
        trx,
      );

      // ENG-1609 AC4 — comment.updated, atomic in the same tx.
      await this.outboxWriter.enqueue(trx, {
        type: EVT_COMMENT_UPDATED,
        aggregateId: comment.id,
        workspaceId: comment.workspaceId,
        payload: { id: comment.id, pageId: comment.pageId },
      });
    });

    await this.queueCommentNotification(
      commentContent,
      oldMentionIds,
      comment.id,
      comment.pageId,
      comment.spaceId,
      comment.workspaceId,
      authUser.id,
      false,
    );

    comment.content = commentContent;
    comment.editedAt = editedAt;
    comment.updatedAt = editedAt;

    this.wsService.emitCommentEvent(comment.spaceId, comment.pageId, {
      operation: 'commentUpdated',
      pageId: comment.pageId,
      comment,
    });

    return comment;
  }

  /**
   * ENG-1609 AC4 — comment.deleted, atomic with the delete itself. Callers
   * (the comment controller) do the ownership/permission check up front and
   * pass in the already-loaded comment to delete.
   */
  async delete(comment: Comment): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.commentRepo.deleteComment(comment.id, trx);

      await this.outboxWriter.enqueue(trx, {
        type: EVT_COMMENT_DELETED,
        aggregateId: comment.id,
        workspaceId: comment.workspaceId,
        payload: { id: comment.id, pageId: comment.pageId },
      });
    });
  }

  private async queueCommentNotification(
    content: any,
    oldMentionIds: string[],
    commentId: string,
    pageId: string,
    spaceId: string,
    workspaceId: string,
    actorId: string,
    notifyWatchers: boolean,
    parentCommentId?: string,
  ) {
    const mentionedUserIds = extractUserMentionIdsFromJson(content);
    const newMentionIds = mentionedUserIds.filter(
      (id) => id !== actorId && !oldMentionIds.includes(id),
    );

    if (newMentionIds.length === 0 && !notifyWatchers && !parentCommentId) return;

    const jobData: ICommentNotificationJob = {
      commentId,
      parentCommentId,
      pageId,
      spaceId,
      workspaceId,
      actorId,
      mentionedUserIds: newMentionIds,
      notifyWatchers,
    };

    await this.notificationQueue.add(
      QueueJob.COMMENT_NOTIFICATION,
      jobData,
    );
  }
}
