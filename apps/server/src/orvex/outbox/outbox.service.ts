import { Injectable, Logger } from '@nestjs/common';
import { WikiEventType } from './outbox.types';

/**
 * OutboxService — enqueues one `orvex_outbox` row in the SAME DB transaction as
 * the mutation (FR-W5). Called from the `page.service.ts` lifecycle hook and the
 * collab `onStoreDocument` path so no mutation escapes the spine.
 *
 * SCAFFOLD: `enqueue` is a no-op. The real implementation takes the active
 * Kysely transaction handle and INSERTs the row atomically with the mutation
 * (typed `unknown` here so the skeleton compiles without `@docmost/db`).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  async enqueue(params: {
    tx: unknown;
    workspaceId: string;
    eventType: WikiEventType;
    payload: unknown;
  }): Promise<void> {
    // TODO(fold-in WS-5): INSERT INTO orvex_outbox (...) within params.tx.
    this.logger.debug(
      `enqueue ${params.eventType} for ${params.workspaceId} (scaffold no-op)`,
    );
  }
}
