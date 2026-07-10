import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { StorageService } from '../../../integrations/storage/storage.service';
import { MultipartFile } from '@fastify/multipart';
import {
  getAttachmentFolderPath,
  PreparedFile,
  prepareFile,
  validateFileType,
} from '../attachment.utils';
import { v4 as uuid4, v7 as uuid7 } from 'uuid';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { AttachmentType, validImageExtensions } from '../attachment.constants';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { Attachment, User, Workspace } from '@docmost/db/types/entity.types';
import { InjectKysely } from 'nestjs-kysely';
import { executeTx, acquireWorkspaceQuotaLock } from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueName } from '../../../integrations/queue/constants';
import { Queue } from 'bullmq';
import { createByteCountingStream } from '../../../common/helpers/utils';
import { OutboxWriter } from '../../../orvex/events/outbox/outbox-writer.service';
import {
  EVT_ATTACHMENT_CREATED,
  EVT_ATTACHMENT_DELETED,
} from '../../../orvex/events/constants/orvex-event-types';
import { EntitlementService } from '../../../orvex/entitlement/entitlement.service';
import { QuotaExceededException } from '../../../orvex/entitlement/quota.exception';

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);
  constructor(
    private readonly storageService: StorageService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly spaceRepo: SpaceRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    private readonly outboxWriter: OutboxWriter,
    private readonly entitlementService: EntitlementService,
  ) {}

  /**
   * ENG-1609 AC5 — attachment.deleted, atomic with the DB delete of the
   * attachment row (the storage-file delete is a true external IO side
   * effect and stays outside the DB transaction, matching every other
   * caller in this service).
   */
  private async deleteAttachmentRow(
    attachment: { id: string; workspaceId: string },
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.attachmentRepo.deleteAttachmentById(attachment.id, trx);

      await this.outboxWriter.enqueue(trx, {
        type: EVT_ATTACHMENT_DELETED,
        aggregateId: attachment.id,
        workspaceId: attachment.workspaceId,
        payload: { id: attachment.id, workspaceId: attachment.workspaceId },
      });
    });
  }

  async uploadFile(opts: {
    filePromise: Promise<MultipartFile>;
    pageId?: string;
    userId: string;
    spaceId: string;
    workspaceId: string;
    attachmentId?: string;
  }) {
    const { filePromise, pageId, spaceId, userId, workspaceId } = opts;
    const preparedFile: PreparedFile = await prepareFile(filePromise, {
      skipBuffer: true,
    });

    let isUpdate = false;
    let attachmentId = null;

    // passing attachmentId to allow for updating diagrams
    // instead of creating new files for each save
    if (opts?.attachmentId) {
      const existingAttachment = await this.attachmentRepo.findById(
        opts.attachmentId,
      );
      if (!existingAttachment) {
        throw new NotFoundException(
          'Existing attachment to overwrite not found',
        );
      }

      if (
        existingAttachment.pageId !== pageId ||
        existingAttachment.fileExt !== preparedFile.fileExtension ||
        existingAttachment.workspaceId !== workspaceId
      ) {
        throw new BadRequestException('File attachment does not match');
      }
      attachmentId = opts.attachmentId;
      isUpdate = true;
    } else {
      attachmentId = uuid7();
    }

    // ENG-1382 (AC4/AC6) — F-QUOTA write chokepoint, fast pre-check: reject a
    // workspace already at its file-count or storage-aggregate cap BEFORE
    // streaming any bytes to the storage driver, so an already-full
    // workspace never pays the upload cost. Cap VALUE from billing, never
    // hard-coded (❌#10). This is NOT the authoritative check — the real
    // file size is unknown until the stream is fully consumed, so it cannot
    // alone stop an under-cap upload whose actual size crosses the
    // aggregate, nor a concurrent-upload race (ENG-1382 fix pass 1, F1/F3).
    // The authoritative, race-safe recheck happens after streaming,
    // immediately before the attachment row is written, below.
    if (!isUpdate) {
      const currentFileCount =
        await this.attachmentRepo.countByWorkspaceId(workspaceId);
      await this.entitlementService.assertWithinQuota(
        workspaceId,
        'files',
        currentFileCount,
      );

      const currentStorageBytes =
        await this.attachmentRepo.sumFileSizeByWorkspaceId(workspaceId);
      await this.entitlementService.assertWithinQuota(
        workspaceId,
        'storage',
        currentStorageBytes,
      );
    }

    const filePath = `${getAttachmentFolderPath(AttachmentType.File, workspaceId)}/${attachmentId}/${preparedFile.fileName}`;

    const { stream, getBytesRead } = createByteCountingStream(
      preparedFile.multiPartFile.file,
    );

    await this.uploadToDrive(filePath, stream);

    // Update fileSize from the consumed stream
    preparedFile.fileSize = getBytesRead();

    let attachment: Attachment = null;
    try {
      if (isUpdate) {
        attachment = await this.attachmentRepo.updateAttachment(
          {
            fileSize: preparedFile.fileSize,
            updatedAt: new Date(),
          },
          attachmentId,
        );
      } else {
        // ENG-1382 fix pass 1 (F1/F3) — the authoritative chokepoint: the
        // advisory lock is the FIRST statement in this transaction so a
        // concurrent upload for the same workspace blocks until this one
        // commits/rolls back and then re-reads the now-current count/
        // aggregate (F1 — no cap-bypass race). `assertIncrementWithinQuota`
        // checks `currentAggregate + thisFile.fileSize > cap` — AC4's
        // literal "an upload would exceed it" — not merely
        // "already at cap", closing the semantic gap where an under-cap
        // workspace could upload an oversized file (F3). The per-file
        // `wiki_max_file_bytes` cap is enforced the same way with a
        // baseline of 0.
        attachment = await executeTx(this.db, async (trx) => {
          await acquireWorkspaceQuotaLock(trx, 'storage', workspaceId);

          const currentFileCount = await this.attachmentRepo.countByWorkspaceId(
            workspaceId,
            trx,
          );
          await this.entitlementService.assertWithinQuota(
            workspaceId,
            'files',
            currentFileCount,
          );

          const currentStorageBytes =
            await this.attachmentRepo.sumFileSizeByWorkspaceId(
              workspaceId,
              trx,
            );
          await this.entitlementService.assertIncrementWithinQuota(
            workspaceId,
            'storage',
            currentStorageBytes,
            preparedFile.fileSize,
          );
          await this.entitlementService.assertIncrementWithinQuota(
            workspaceId,
            'file_bytes',
            0,
            preparedFile.fileSize,
          );

          return this.saveAttachment({
            attachmentId,
            preparedFile,
            filePath,
            type: AttachmentType.File,
            userId,
            spaceId,
            workspaceId,
            pageId,
            trx,
          });
        });
      }

      // ENG-1437 — engine-local FTS-index enqueue REMOVED. Extraction is
      // owned solely by orvex-studio-knowledge (ENG-1480), which consumes
      // the `attachment.created` outbox event written atomically by
      // `saveAttachment` (below) — that delegation is preserved.
    } catch (err) {
      if (err instanceof QuotaExceededException) {
        // The bytes were already streamed to storage (skipBuffer means the
        // real size is only known after the fact) before this authoritative
        // recheck rejected it — clean up the orphaned object so it never
        // lands in a future aggregate/count read, then surface the real 402.
        await this.storageService.delete(filePath).catch(() => undefined);
        throw err;
      }
      // delete uploaded file on error
      this.logger.error(err);
    }

    return attachment;
  }

  async uploadImage(
    filePromise: Promise<MultipartFile>,
    type:
      | AttachmentType.Avatar
      | AttachmentType.WorkspaceIcon
      | AttachmentType.SpaceIcon,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ) {
    const preparedFile: PreparedFile = await prepareFile(filePromise);
    validateFileType(preparedFile.fileExtension, validImageExtensions);

    preparedFile.fileName = uuid4() + preparedFile.fileExtension;

    const filePath = `${getAttachmentFolderPath(type, workspaceId)}/${preparedFile.fileName}`;

    await this.uploadToDrive(filePath, preparedFile.buffer);

    let attachment: Attachment = null;
    let oldFileName: string = null;

    try {
      await executeTx(this.db, async (trx) => {
        attachment = await this.saveAttachment({
          preparedFile,
          filePath,
          type,
          userId,
          workspaceId,
          trx,
        });

        if (type === AttachmentType.Avatar) {
          const user = await this.userRepo.findById(userId, workspaceId, {
            trx,
          });

          oldFileName = user.avatarUrl;

          await this.userRepo.updateUser(
            { avatarUrl: preparedFile.fileName },
            userId,
            workspaceId,
            trx,
          );
        } else if (type === AttachmentType.WorkspaceIcon) {
          const workspace = await this.workspaceRepo.findById(workspaceId, {
            trx,
          });

          oldFileName = workspace.logo;

          await this.workspaceRepo.updateWorkspace(
            { logo: preparedFile.fileName },
            workspaceId,
            trx,
          );
        } else if (type === AttachmentType.SpaceIcon && spaceId) {
          const space = await this.spaceRepo.findById(spaceId, workspaceId, {
            trx,
          });

          oldFileName = space.logo;

          await this.spaceRepo.updateSpace(
            { logo: preparedFile.fileName },
            spaceId,
            workspaceId,
            trx,
          );
        } else {
          throw new BadRequestException(`Image upload aborted.`);
        }
      });
    } catch (err) {
      // delete uploaded file on db update failure
      await this.deleteRedundantFile(filePath);
      throw new BadRequestException('Failed to upload image');
    }

    if (oldFileName && !oldFileName.toLowerCase().startsWith('http')) {
      // delete old avatar or logo
      const oldFilePath =
        getAttachmentFolderPath(type, workspaceId) + '/' + oldFileName;
      await this.deleteRedundantFile(oldFilePath);
    }

    return attachment;
  }

  async deleteRedundantFile(filePath: string) {
    try {
      await this.storageService.delete(filePath);
      await this.attachmentRepo.deleteAttachmentByFilePath(filePath);
    } catch (error) {
      this.logger.error('deleteRedundantFile', error);
    }
  }

  async uploadToDrive(filePath: string, fileContent: Buffer | Readable) {
    try {
      await this.storageService.upload(filePath, fileContent);
    } catch (err) {
      this.logger.error('Error uploading file to drive:', err);
      throw new BadRequestException('Error uploading file to drive');
    }
  }

  async saveAttachment(opts: {
    attachmentId?: string;
    preparedFile: PreparedFile;
    filePath: string;
    type: AttachmentType;
    userId: string;
    workspaceId: string;
    pageId?: string;
    spaceId?: string;
    trx?: KyselyTransaction;
  }): Promise<Attachment> {
    const {
      attachmentId,
      preparedFile,
      filePath,
      type,
      userId,
      workspaceId,
      pageId,
      spaceId,
      trx,
    } = opts;

    // ENG-1609 AC5 — attachment.created, atomic with the insert. `saveAttachment`
    // is the single production insert point shared by `uploadFile` (no caller
    // trx) and `uploadImage` (caller-managed trx) — `executeTx` opens its own
    // transaction only when the caller didn't already give it one.
    return executeTx(
      this.db,
      async (innerTrx) => {
        const attachment = await this.attachmentRepo.insertAttachment(
          {
            id: attachmentId,
            type: type,
            filePath: filePath,
            fileName: preparedFile.fileName,
            fileSize: preparedFile.fileSize,
            mimeType: preparedFile.mimeType,
            fileExt: preparedFile.fileExtension,
            creatorId: userId,
            workspaceId: workspaceId,
            pageId: pageId,
            spaceId: spaceId,
          },
          innerTrx,
        );

        await this.outboxWriter.enqueue(innerTrx, {
          type: EVT_ATTACHMENT_CREATED,
          aggregateId: attachment.id,
          workspaceId,
          payload: { id: attachment.id, workspaceId, type },
        });

        return attachment;
      },
      trx,
    );
  }

  async handleDeleteAiChatAttachments(aiChatId: string) {
    try {
      const attachments = await this.attachmentRepo.findByAiChatId(aiChatId);
      if (!attachments || attachments.length === 0) {
        return;
      }

      await Promise.all(
        attachments.map(async (attachment) => {
          try {
            await this.storageService.delete(attachment.filePath);
            await this.deleteAttachmentRow(attachment);
          } catch (err) {
            this.logger.log(
              `DeleteAiChatAttachments: failed to delete attachment ${attachment.id}:`,
              err,
            );
          }
        }),
      );
    } catch (err) {
      throw err;
    }
  }

  async handleDeleteSpaceAttachments(spaceId: string) {
    try {
      const attachments = await this.attachmentRepo.findBySpaceId(spaceId);
      if (!attachments || attachments.length === 0) {
        return;
      }

      const failedDeletions = [];

      await Promise.all(
        attachments.map(async (attachment) => {
          try {
            await this.storageService.delete(attachment.filePath);
            await this.deleteAttachmentRow(attachment);
          } catch (err) {
            failedDeletions.push(attachment.id);
            this.logger.log(
              `DeleteSpaceAttachments: failed to delete attachment ${attachment.id}:`,
              err,
            );
          }
        }),
      );

      if (failedDeletions.length === attachments.length) {
        throw new Error(
          `Failed to delete any attachments for spaceId: ${spaceId}`,
        );
      }
    } catch (err) {
      throw err;
    }
  }

  async handleDeleteUserAvatars(userId: string) {
    try {
      const userAvatars = await this.db
        .selectFrom('attachments')
        .select(['id', 'filePath', 'workspaceId'])
        .where('creatorId', '=', userId)
        .where('type', '=', AttachmentType.Avatar)
        .execute();

      if (!userAvatars || userAvatars.length === 0) {
        return;
      }

      await Promise.all(
        userAvatars.map(async (attachment) => {
          try {
            await this.storageService.delete(attachment.filePath);
            await this.deleteAttachmentRow(attachment);
          } catch (err) {
            this.logger.log(
              `DeleteUserAvatar: failed to delete user avatar ${attachment.id}:`,
              err,
            );
          }
        }),
      );
    } catch (err) {
      throw err;
    }
  }

  async handleDeletePageAttachments(pageId: string) {
    try {
      // Fetch attachments for this page from database
      const attachments = await this.db
        .selectFrom('attachments')
        .select(['id', 'filePath', 'workspaceId'])
        .where('pageId', '=', pageId)
        .execute();

      if (!attachments || attachments.length === 0) {
        return;
      }

      const failedDeletions = [];

      await Promise.all(
        attachments.map(async (attachment) => {
          try {
            // Delete from storage
            await this.storageService.delete(attachment.filePath);
            // Delete from database (+ ENG-1609 outbox row, atomic)
            await this.deleteAttachmentRow(attachment);
          } catch (err) {
            failedDeletions.push(attachment.id);
            this.logger.error(
              `Failed to delete attachment ${attachment.id} for page ${pageId}:`,
              err,
            );
          }
        }),
      );

      if (failedDeletions.length > 0) {
        this.logger.warn(
          `Failed to delete ${failedDeletions.length} attachments for page ${pageId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Error in handleDeletePageAttachments for page ${pageId}:`,
        err,
      );
      throw err;
    }
  }

  async removeUserAvatar(user: User) {
    if (user.avatarUrl && !user.avatarUrl.toLowerCase().startsWith('http')) {
      const filePath = `${getAttachmentFolderPath(AttachmentType.Avatar, user.workspaceId)}/${user.avatarUrl}`;
      await this.deleteRedundantFile(filePath);
    }

    await this.userRepo.updateUser(
      { avatarUrl: null },
      user.id,
      user.workspaceId,
    );
  }

  async removeSpaceIcon(spaceId: string, workspaceId: string) {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.logo && !space.logo.toLowerCase().startsWith('http')) {
      const filePath = `${getAttachmentFolderPath(AttachmentType.SpaceIcon, workspaceId)}/${space.logo}`;
      await this.deleteRedundantFile(filePath);
    }

    await this.spaceRepo.updateSpace({ logo: null }, spaceId, workspaceId);
  }

  async removeWorkspaceIcon(workspace: Workspace) {
    if (workspace.logo && !workspace.logo.toLowerCase().startsWith('http')) {
      const filePath = `${getAttachmentFolderPath(AttachmentType.WorkspaceIcon, workspace.id)}/${workspace.logo}`;
      await this.deleteRedundantFile(filePath);
    }

    await this.workspaceRepo.updateWorkspace({ logo: null }, workspace.id);
  }
}
