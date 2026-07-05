import { Module } from '@nestjs/common';
import { CellModule } from '../cell/cell.module';
import { OutboxService } from './outbox.service';
import { OutboxRelay } from './outbox-relay.service';

/**
 * Both the api/collab roles (which ENQUEUE via OutboxService) and the worker
 * role (which DRAINS via OutboxRelay) import this. The relay loop itself is
 * started only in the worker role — never from the vanilla boot path.
 */
@Module({
  imports: [CellModule],
  providers: [OutboxService, OutboxRelay],
  exports: [OutboxService, OutboxRelay],
})
export class OutboxModule {}
