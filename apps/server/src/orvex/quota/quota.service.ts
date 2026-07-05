import { Injectable } from '@nestjs/common';
import { EntitlementReader } from './entitlement-reader';
import { QuotaCounters } from './quota-counters';
import { QuotaResource, QuotaVerdict } from './quota.types';

/**
 * QuotaService — the DOMAIN function that computes the over-quota verdict
 * (A-QUOTA-HARDENING F9). `page.controller.ts` and the collab persistence hook
 * only MARSHAL this verdict into the `402 QUOTA_EXCEEDED` response; they never
 * embed the entitlement-vs-usage comparison in the handler.
 *
 * Enforcement lives in the ENGINE (not wiki-api) because pages/attachments are
 * creatable via the engine's own REST API AND the Hocuspocus collab persistence
 * path — the write chokepoint is the only leak-proof point (A-QUOTA). A
 * REST-only check is silently bypassed by the Yjs store.
 *
 * SCAFFOLD: the checks return `allowed: true` (TODO the real fast-counter vs
 * entitlement comparison in WS-4).
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly entitlements: EntitlementReader,
    private readonly counters: QuotaCounters,
  ) {}

  async checkPageCreate(workspaceId: string): Promise<QuotaVerdict> {
    return this.check('pages', workspaceId, (e) => e.maxPages);
  }

  async checkAttachmentUpload(
    workspaceId: string,
    fileBytes: number,
  ): Promise<QuotaVerdict> {
    // TODO(fold-in WS-4): also enforce maxFileBytes on `fileBytes` and the
    // aggregate `bytes` counter; return the first failing verdict.
    void fileBytes;
    return this.check('bytes', workspaceId, (e) => e.storageBytesAggregate);
  }

  async checkMemberAdd(
    workspaceId: string,
    viaSsoJit = false,
  ): Promise<QuotaVerdict> {
    // FR-W13: SSO/SCIM JIT is allowed to 110%; manual invites blocked at the cap.
    void viaSsoJit;
    return this.check('members', workspaceId, (e) => e.maxMembers);
  }

  private async check(
    resource: QuotaResource,
    workspaceId: string,
    limitOf: (e: Awaited<ReturnType<EntitlementReader['forTenant']>>) => number,
  ): Promise<QuotaVerdict> {
    const entitlement = await this.entitlements.forTenant(workspaceId);
    const limit = limitOf(entitlement);
    const current = await this.counters.current(resource, workspaceId);

    // TODO(fold-in WS-4): compute `allowed = current < limit`, honour the
    // fail-closed/fail-open ceiling (counters.failsClosed) and the
    // `ORVEX_QUOTAS_ENFORCE=warn` calibration window (200%-of-cap hard stop).
    const allowed = true;

    return {
      allowed,
      resource,
      code: allowed ? 'OK' : 'QUOTA_EXCEEDED',
      current,
      limit,
    };
  }
}
