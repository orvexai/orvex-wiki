import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AttachmentService } from '../services/attachment.service';
import { QueueJob, QueueName } from 'src/integrations/queue/constants';

@Processor(QueueName.ATTACHMENT_QUEUE)
export class AttachmentProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(AttachmentProcessor.name);
  constructor(private readonly attachmentService: AttachmentService) {
    super();
  }

  // ENG-1437 — the attachment FTS-index job branch (lazy `require` of the
  // non-bundled attachments-EE extractor) is REMOVED. Extraction is owned
  // solely by orvex-studio-knowledge (ENG-1480), consuming the
  // `attachment.created` outbox event. The DELETE_* branches below are
  // unaffected. `ModuleRef` was only ever injected to lazily resolve that
  // removed EE extractor — dropped as a dead collaborator (review-1 F3).
  async process(job: Job<any, void>): Promise<void> {
    try {
      if (job.name === QueueJob.DELETE_SPACE_ATTACHMENTS) {
        await this.attachmentService.handleDeleteSpaceAttachments(job.data.id);
      }
      if (job.name === QueueJob.DELETE_USER_AVATARS) {
        await this.attachmentService.handleDeleteUserAvatars(job.data.id);
      }
      if (job.name === QueueJob.DELETE_PAGE_ATTACHMENTS) {
        await this.attachmentService.handleDeletePageAttachments(
          job.data.pageId,
        );
      }
      if (job.name === QueueJob.DELETE_AI_CHAT_ATTACHMENTS) {
        await this.attachmentService.handleDeleteAiChatAttachments(
          job.data.aiChatId,
        );
      }
    } catch (err) {
      throw err;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing ${job.name} job`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.error(
      `Error processing ${job.name} job. Reason: ${job.failedReason}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Completed ${job.name} job`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
