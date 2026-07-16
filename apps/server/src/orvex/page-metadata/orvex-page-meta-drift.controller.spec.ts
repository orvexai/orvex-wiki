// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrvexPageMetaDriftController } from './orvex-page-meta-drift.controller';
import { ENGINE_DRIFT_HEAD_SENTINEL } from './page-meta-verification.service';

/**
 * amazing-MCP drift-502 fix — the engine leg for wiki-api's drift verifier.
 * These prove the routes exist and answer honestly (no 502): workspace scope +
 * per-page ACL (no-leak 404/403), the verify-context canEdit resolution, and
 * the stamps sentinel/drift wiring.
 */
describe('OrvexPageMetaDriftController', () => {
  const user = { id: 'u1' } as any;
  const workspace = { id: 'ws-1' } as any;

  function make(opts: {
    page?: any;
    can?: (a: any, s: any) => boolean;
    seed?: any;
    drifted?: any[];
  }) {
    const pageRepo = { findById: jest.fn(async () => opts.page) };
    const verificationService = {
      getVerifyContext: jest.fn(async () => opts.seed ?? null),
      listDriftedStamps: jest.fn(async () => opts.drifted ?? []),
      stampVerification: jest.fn(async () => undefined),
    };
    const ability = {
      can: opts.can ?? (() => true),
      cannot: (a: any, s: any) => !(opts.can ?? (() => true))(a, s),
    };
    const spaceAbilityFactory = { createForUser: jest.fn(async () => ability) };
    const controller = new OrvexPageMetaDriftController(
      verificationService as any,
      pageRepo as any,
      spaceAbilityFactory as any,
    );
    return { controller, pageRepo, verificationService };
  }

  it('verify-context returns {canEdit, ...seed} for a viewable page', async () => {
    const { controller } = make({
      page: { id: 'p1', spaceId: 's1', workspaceId: 'ws-1', deletedAt: null },
      can: () => true,
      seed: {
        currentBody: '# body',
        headSha: 'hash-abc',
        lastVerifiedHash: '',
        lastVerifiedFound: false,
      },
    });
    const res: any = await controller.verifyContext('p1', user, workspace);
    expect(res.canEdit).toBe(true);
    expect(res.headSha).toBe('hash-abc');
    expect(res.currentBody).toBe('# body');
  });

  it('verify-context is a no-leak 404 for a page outside the workspace', async () => {
    const { controller } = make({
      page: { id: 'p1', spaceId: 's1', workspaceId: 'OTHER', deletedAt: null },
    });
    await expect(
      controller.verifyContext('p1', user, workspace),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('verify-context is a no-leak 403 for a non-viewer', async () => {
    const { controller } = make({
      page: { id: 'p1', spaceId: 's1', workspaceId: 'ws-1', deletedAt: null },
      can: () => false,
    });
    await expect(
      controller.verifyContext('p1', user, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stamp requires edit — a non-editor is 403 and never persists', async () => {
    const { controller, verificationService } = make({
      page: { id: 'p1', spaceId: 's1', workspaceId: 'ws-1', deletedAt: null },
      can: () => false,
    });
    await expect(
      controller.stamp(
        'p1',
        { verifiedAgainst: 'hash-abc' } as any,
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationService.stampVerification).not.toHaveBeenCalled();
  });

  it('stamp persists verified_against for an editor', async () => {
    const { controller, verificationService } = make({
      page: { id: 'p1', spaceId: 's1', workspaceId: 'ws-1', deletedAt: null },
      can: () => true,
    });
    const res = await controller.stamp(
      'p1',
      { verifiedAgainst: 'hash-abc', verifiedAt: '2026-07-16T10:00:00.000Z' } as any,
      user,
      workspace,
    );
    expect(res).toEqual({ ok: true });
    expect(verificationService.stampVerification).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'p1', verifiedAgainst: 'hash-abc' }),
    );
  });

  it('stamps returns the sentinel headSha + the workspace drifted rows', async () => {
    const { controller } = make({
      drifted: [{ page_id: 'p1', verified_against: 'old-hash' }],
    });
    const res = await controller.stamps(workspace);
    expect(res.headSha).toBe(ENGINE_DRIFT_HEAD_SENTINEL);
    expect(res.pages).toEqual([{ page_id: 'p1', verified_against: 'old-hash' }]);
    // The sentinel never equals a real content hash, so GetDrift flags every
    // returned (already-drifted) row.
    expect(res.pages[0].verified_against).not.toBe(res.headSha);
  });
});
