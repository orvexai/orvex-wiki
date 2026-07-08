import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import {
  EntitlementCheckResponse,
  GatedFeature,
  Principal,
} from './entitlement.types';
import {
  EntitlementUnavailableException,
  QuotaExceededException,
} from './quota.exception';

function fixture(
  overrides: Partial<EntitlementCheckResponse> = {},
): EntitlementCheckResponse {
  return {
    plan: 'free',
    plan_version: 'v1',
    features: ['ask_wiki'],
    caps: {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 20,
      wiki_max_pages: 200,
      wiki_storage_bytes_aggregate: 1_000_000_000,
      wiki_max_file_bytes: 10_000_000,
      wiki_max_files: 2000,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
    },
    trial: { state: 'none' },
    throttle: { state: 'none' },
    version: 'v1',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * ENG-1382 — `EntitlementService` unit tests (CS §5 ❌#4: never mock this
 * own package — test it directly through its exported interface).
 */
describe('EntitlementService', () => {
  const workspaceId = 'ws-1';

  // AC7 — fail-closed path.
  it('AC7: port erroring AND no cache -> 503 EntitlementUnavailableException', async () => {
    const failingPort: BillingEntitlementPort = {
      checkEntitlement: async () => {
        throw new Error('billing unreachable');
      },
    };
    const service = new EntitlementService(
      failingPort,
      new InMemoryEntitlementCache(),
    );

    await expect(
      service.assertWithinQuota(workspaceId, 'pages', 0),
    ).rejects.toBeInstanceOf(EntitlementUnavailableException);
  });

  it('AC7: port erroring BUT a cached projection exists -> enforces the cached cap', async () => {
    const cache = new InMemoryEntitlementCache();
    await cache.set(
      { principal_type: 'org', principal_id: workspaceId },
      fixture({ caps: { ...fixture().caps, wiki_max_pages: 5 } }),
    );
    const failingPort: BillingEntitlementPort = {
      checkEntitlement: async () => {
        throw new Error('billing unreachable');
      },
    };
    const service = new EntitlementService(failingPort, cache);

    // at the cached cap -> blocks
    await expect(
      service.assertWithinQuota(workspaceId, 'pages', 5),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    // under the cached cap -> resolves
    await expect(
      service.assertWithinQuota(workspaceId, 'pages', 4),
    ).resolves.toBeUndefined();
  });

  it('AC5: hasFeature tracks the catalog exactly', async () => {
    const mcpFeature = 'mcp' as unknown as GatedFeature;
    const scimFeature = 'scim' as unknown as GatedFeature;
    const port: BillingEntitlementPort = {
      checkEntitlement: async () => fixture({ features: [mcpFeature] }),
    };
    const service = new EntitlementService(port, new InMemoryEntitlementCache());

    await expect(service.hasFeature(workspaceId, mcpFeature)).resolves.toBe(
      true,
    );
    await expect(
      service.hasFeature(workspaceId, scimFeature),
    ).resolves.toBe(false);
  });

  it('a cap value of 0 is billing\'s documented "uncapped" sentinel', async () => {
    const port: BillingEntitlementPort = {
      checkEntitlement: async () =>
        fixture({ caps: { ...fixture().caps, wiki_max_members: 0 } }),
    };
    const service = new EntitlementService(port, new InMemoryEntitlementCache());

    await expect(
      service.assertWithinQuota(workspaceId, 'members', 1_000_000),
    ).resolves.toBeUndefined();
  });

  // ENG-1382 fix pass 1 (F3) — assertIncrementWithinQuota: the AC4 literal
  // "would exceed" shape (currentUsage + increment > limit), distinct from
  // assertWithinQuota's "already at/over" shape.
  describe('assertIncrementWithinQuota', () => {
    it('allows an increment that lands exactly AT the cap', async () => {
      const port: BillingEntitlementPort = {
        checkEntitlement: async () =>
          fixture({
            caps: { ...fixture().caps, wiki_storage_bytes_aggregate: 1_000 },
          }),
      };
      const service = new EntitlementService(port, new InMemoryEntitlementCache());

      await expect(
        service.assertIncrementWithinQuota(workspaceId, 'storage', 900, 100),
      ).resolves.toBeUndefined();
    });

    it('rejects an increment that would push the aggregate past the cap (AC4 "would exceed")', async () => {
      const port: BillingEntitlementPort = {
        checkEntitlement: async () =>
          fixture({
            caps: { ...fixture().caps, wiki_storage_bytes_aggregate: 1_000 },
          }),
      };
      const service = new EntitlementService(port, new InMemoryEntitlementCache());

      // Under the aggregate cap (900 < 1000) but the incoming file (200)
      // would push it to 1100 — this is the F3 semantic gap: a pre-write
      // `currentUsage >= limit` check would have wrongly allowed this.
      await expect(
        service.assertIncrementWithinQuota(workspaceId, 'storage', 900, 200),
      ).rejects.toBeInstanceOf(QuotaExceededException);
    });

    it('a single oversized file is rejected against the per-file wiki_max_file_bytes cap', async () => {
      const port: BillingEntitlementPort = {
        checkEntitlement: async () =>
          fixture({
            caps: { ...fixture().caps, wiki_max_file_bytes: 500 },
          }),
      };
      const service = new EntitlementService(port, new InMemoryEntitlementCache());

      await expect(
        service.assertIncrementWithinQuota(workspaceId, 'file_bytes', 0, 501),
      ).rejects.toBeInstanceOf(QuotaExceededException);
      await expect(
        service.assertIncrementWithinQuota(workspaceId, 'file_bytes', 0, 500),
      ).resolves.toBeUndefined();
    });

    it('a cap of 0 is uncapped for increments too', async () => {
      const port: BillingEntitlementPort = {
        checkEntitlement: async () =>
          fixture({ caps: { ...fixture().caps, wiki_max_file_bytes: 0 } }),
      };
      const service = new EntitlementService(port, new InMemoryEntitlementCache());

      await expect(
        service.assertIncrementWithinQuota(
          workspaceId,
          'file_bytes',
          0,
          1_000_000_000,
        ),
      ).resolves.toBeUndefined();
    });
  });

  it('caches the resolved entitlement so a second call does not re-hit the port', async () => {
    let calls = 0;
    const port: BillingEntitlementPort = {
      checkEntitlement: async () => {
        calls++;
        return fixture();
      },
    };
    const service = new EntitlementService(port, new InMemoryEntitlementCache());

    await service.hasFeature(workspaceId, 'ask_wiki');
    await service.hasFeature(workspaceId, 'ask_wiki');

    expect(calls).toBe(1);
  });
});
