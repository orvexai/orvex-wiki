import { Injectable, Logger } from '@nestjs/common';
import { QuotaResource } from './quota.types';

/**
 * QuotaCounters — the pre-flight, O(1) Redis fast-counters (FR-W12).
 *
 * `quota:{resource}:{tenant}` are INCR-on-write and checked BEFORE the write —
 * never a per-request `COUNT(*)`/`SUM(file_size)` scan. A background sweep
 * (O(changed), never O(N-tenants)) reconciles them from truth.
 *
 * On Redis loss the counters fail CLOSED for money-burning resources (storage
 * bytes/files) and fail-open for cheap ones (pages/members) until the sweep
 * reconciles (A-QUOTA / A-QUOTA-HARDENING F6 — that availability-over-cost
 * tradeoff is flagged for a filed ADR).
 *
 * SCAFFOLD: the Redis client is not wired (typed `unknown`); the bodies are
 * TODO so the skeleton compiles without ioredis.
 */
@Injectable()
export class QuotaCounters {
  private readonly logger = new Logger(QuotaCounters.name);

  private key(resource: QuotaResource, workspaceId: string): string {
    return `quota:${resource}:${workspaceId}`;
  }

  /** Current counter value (fail-closed sentinel when Redis is unavailable). */
  async current(_resource: QuotaResource, _workspaceId: string): Promise<number> {
    // TODO(fold-in WS-4): GET quota:{resource}:{tenant} from the counter Redis.
    return 0;
  }

  /** INCR the counter after a successful write. */
  async incr(
    resource: QuotaResource,
    workspaceId: string,
    _by = 1,
  ): Promise<void> {
    // TODO(fold-in WS-4): INCRBY quota:{resource}:{tenant}.
    this.logger.debug(`incr ${this.key(resource, workspaceId)} (scaffold no-op)`);
  }

  /** Which resources fail CLOSED on Redis loss (money-burning). */
  failsClosed(resource: QuotaResource): boolean {
    return resource === 'bytes' || resource === 'files';
  }
}
