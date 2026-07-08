// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { PageStatus } from '@orvex/extensions';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { KyselyDB } from '../../database/types/kysely.types';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { RatifyGateSettingsService } from './ratify-gate-settings.service';
import { RatifyTokenService } from './ratify-token.service';
import {
  TokenVerifyResult,
  TokenVerifyFailureReason,
  RatifyTokenPayload,
} from './ratify-token.types';

/**
 * ENG-1445 review1 F1 — the literal AC5 assertion: "toggling the setting
 * flips whether a tokenless api_key promotion is refused (403/precondition)
 * vs. allowed", exercised through the REAL promote chokepoint
 * (`OrvexPageMetadataService.applyMetadata`/`setStatus`), not just against
 * `getRequired()` in isolation.
 */
describe('OrvexPageMetadataService — AC5/AC6 ratify-gate enforcement', () => {
  const PAGE_ID = 'page-1';
  const WORKSPACE_ID = 'ws-1';

  interface FakeChain {
    select: (...args: unknown[]) => FakeChain;
    selectAll: (...args: unknown[]) => FakeChain;
    where: (...args: unknown[]) => FakeChain;
    executeTakeFirst: () => Promise<unknown>;
  }

  function makeFakeDb(): KyselyDB {
    let currentMeta: Record<string, unknown> | null = null;

    function pagesChain(): FakeChain {
      const chain: FakeChain = {
        select: () => pagesChain(),
        selectAll: () => pagesChain(),
        where: () => pagesChain(),
        executeTakeFirst: async () => ({
          id: PAGE_ID,
          workspaceId: WORKSPACE_ID,
          deletedAt: null,
          title: 'Promote Test Page',
        }),
      };
      return chain;
    }

    function metaChain(mode: 'docType' | 'all'): FakeChain {
      const chain: FakeChain = {
        select: () => metaChain('docType'),
        selectAll: () => metaChain('all'),
        where: () => metaChain(mode),
        executeTakeFirst: async () => {
          if (!currentMeta) return undefined;
          return mode === 'docType'
            ? { docType: (currentMeta as Record<string, unknown>).docType ?? null }
            : currentMeta;
        },
      };
      return chain;
    }

    const fakeDb = {
      selectFrom(table: string) {
        return table === 'pages' ? pagesChain() : metaChain('all');
      },
      insertInto() {
        return {
          values: (vals: Record<string, unknown>) => ({
            onConflict: (cb: (oc: unknown) => unknown) => {
              let patch: Record<string, unknown> = {};
              cb({
                column: () => ({
                  doUpdateSet: (p: Record<string, unknown>) => {
                    patch = p;
                    return {};
                  },
                }),
              });
              return {
                execute: async () => {
                  currentMeta = { ...(currentMeta ?? {}), ...vals, ...patch };
                },
              };
            },
          }),
        };
      },
    };

    return fakeDb as unknown as KyselyDB;
  }

  function makeFakeWorkspaceRepo(): WorkspaceRepo {
    return { findById: jest.fn() } as unknown as WorkspaceRepo;
  }

  function makeRatifyGateSettingsService(required: boolean): RatifyGateSettingsService {
    return {
      getRequired: jest.fn(async () => required),
      assertForceSelfRatify: jest.fn(async (input: { forceReason?: string }) => {
        if (!input.forceReason || input.forceReason.length < 20) {
          throw new PreconditionFailedException({
            error: 'FORCE_SELF_RATIFY_REASON_TOO_SHORT',
          });
        }
      }),
    } as unknown as RatifyGateSettingsService;
  }

  function makeRatifyTokenService(verifyResult: {
    ok: boolean;
    reason?: TokenVerifyFailureReason;
  }): RatifyTokenService {
    return {
      verify: jest.fn(
        (): TokenVerifyResult<RatifyTokenPayload> =>
          verifyResult.ok
            ? {
                ok: true,
                payload: {
                  pageId: PAGE_ID,
                  workspaceId: WORKSPACE_ID,
                  confirmingUserId: 'agent-1',
                  expiresAt: Date.now() + 60_000,
                },
              }
            : { ok: false, reason: verifyResult.reason ?? 'invalid' },
      ),
    } as unknown as RatifyTokenService;
  }

  it('AC5 — refuses a tokenless api_key promotion to canonical when the gate is required (default)', async () => {
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      makeRatifyGateSettingsService(true),
      makeRatifyTokenService({ ok: false, reason: 'malformed' }),
    );

    await expect(
      service.applyMetadata(
        PAGE_ID,
        { status: PageStatus.CANONICAL },
        undefined,
        { authMethod: 'api_key', actorId: 'agent-1' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('AC5 — allows an api_key promotion to canonical once the gate is toggled to required=false', async () => {
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      makeRatifyGateSettingsService(false),
      makeRatifyTokenService({ ok: false }),
    );

    const result = await service.applyMetadata(
      PAGE_ID,
      { status: PageStatus.CANONICAL },
      undefined,
      { authMethod: 'api_key', actorId: 'agent-1' },
    );

    expect(result.status).toBe(PageStatus.CANONICAL);
  });

  it('AC5 — allows an api_key promotion when a valid RATIFY_TOKEN verifies for this page+workspace', async () => {
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      makeRatifyGateSettingsService(true),
      makeRatifyTokenService({ ok: true }),
    );

    const result = await service.applyMetadata(
      PAGE_ID,
      { status: PageStatus.CANONICAL },
      undefined,
      { authMethod: 'api_key', actorId: 'agent-1', ratifyToken: 'rt1.x.y' },
    );

    expect(result.status).toBe(PageStatus.CANONICAL);
  });

  it('AC5 — a human caller (no api_key authMethod) is never gated', async () => {
    const gateService = makeRatifyGateSettingsService(true);
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      gateService,
      makeRatifyTokenService({ ok: false }),
    );

    const result = await service.applyMetadata(
      PAGE_ID,
      { status: PageStatus.CANONICAL },
      undefined,
      { authMethod: undefined, actorId: 'human-1' },
    );

    expect(result.status).toBe(PageStatus.CANONICAL);
    expect(gateService.getRequired).not.toHaveBeenCalled();
  });

  it('AC6 — forceSelfRatify with a reason under 20 chars is rejected even when the gate is required', async () => {
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      makeRatifyGateSettingsService(true),
      makeRatifyTokenService({ ok: false }),
    );

    await expect(
      service.applyMetadata(
        PAGE_ID,
        { status: PageStatus.CANONICAL },
        undefined,
        {
          authMethod: 'api_key',
          actorId: 'agent-1',
          forceSelfRatify: true,
          forceReason: 'too short',
        },
      ),
    ).rejects.toThrow();
  });

  it('AC6 — a valid forceSelfRatify + 20+ char reason bypasses the token requirement', async () => {
    const gateService = makeRatifyGateSettingsService(true);
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      gateService,
      makeRatifyTokenService({ ok: false }),
    );

    const result = await service.applyMetadata(
      PAGE_ID,
      { status: PageStatus.CANONICAL },
      undefined,
      {
        authMethod: 'api_key',
        actorId: 'agent-1',
        forceSelfRatify: true,
        forceReason: 'agent self-ratified with a long enough reason',
      },
    );

    expect(result.status).toBe(PageStatus.CANONICAL);
    expect(gateService.assertForceSelfRatify).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, pageId: PAGE_ID }),
    );
  });

  it('a non-canonical status write for an api_key caller is never gated', async () => {
    const gateService = makeRatifyGateSettingsService(true);
    const service = new OrvexPageMetadataService(
      makeFakeDb(),
      makeFakeWorkspaceRepo(),
      gateService,
      makeRatifyTokenService({ ok: false }),
    );

    const result = await service.applyMetadata(
      PAGE_ID,
      { status: PageStatus.DRAFT },
      undefined,
      { authMethod: 'api_key', actorId: 'agent-1' },
    );

    expect(result.status).toBe(PageStatus.DRAFT);
    expect(gateService.getRequired).not.toHaveBeenCalled();
  });
});
