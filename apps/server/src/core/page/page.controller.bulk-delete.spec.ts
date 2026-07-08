// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException } from '@nestjs/common';
import { PageController } from './page.controller';
import { ConfirmTokenService } from '../../orvex/page-metadata/confirm-token.service';

/**
 * ENG-1445 AC4 (review1 F2) — the literal DoD assertion: "agent bulk-delete
 * without a valid confirm token -> refused", exercised through the REAL
 * `PageController.bulkDelete` HTTP chokepoint, not a local test fixture.
 */
describe('PageController.bulkDelete — AC4 confirm-token chokepoint', () => {
  const WORKSPACE = { id: 'ws-1' } as any;
  const USER = { id: 'user-1' } as any;

  function makePage(id: string) {
    return { id, workspaceId: WORKSPACE.id, spaceId: 'space-1' };
  }

  function makeController(opts: {
    confirmTokenService: ConfirmTokenService;
  }) {
    const pageRepo = {
      findById: jest.fn(async (id: string) => makePage(id)),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({ cannot: () => false })),
    };
    const pageService = {
      forceDelete: jest.fn(async () => undefined),
    };
    const auditService = { log: jest.fn() };

    const controller = new PageController(
      pageService as any,
      pageRepo as any,
      {} as any, // pageHistoryService
      spaceAbility as any,
      {} as any, // pageAccessService
      {} as any, // backlinkService
      {} as any, // labelService
      auditService as any,
      {} as any, // provenanceService
      {} as any, // db
      opts.confirmTokenService,
    );

    return { controller, pageService, auditService };
  }

  it('refuses an api_key caller with no confirm token', async () => {
    const confirmTokenService = new ConfirmTokenService({
      getAppSecret: () => 'x'.repeat(40),
    } as any);
    const { controller, pageService } = makeController({ confirmTokenService });

    await expect(
      controller.bulkDelete(
        { pageIds: ['page-1'], scopeId: 'batch-1' } as any,
        USER,
        WORKSPACE,
        'api_key',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(pageService.forceDelete).not.toHaveBeenCalled();
  });

  it('refuses an api_key caller presenting a wrong-scope confirm token', async () => {
    const confirmTokenService = new ConfirmTokenService({
      getAppSecret: () => 'x'.repeat(40),
    } as any);
    const { token } = confirmTokenService.issue({
      workspaceId: WORKSPACE.id,
      action: 'bulk_delete',
      scopeId: 'batch-OTHER',
      confirmingUserId: USER.id,
    });
    const { controller, pageService } = makeController({ confirmTokenService });

    await expect(
      controller.bulkDelete(
        { pageIds: ['page-1'], scopeId: 'batch-1', confirmToken: token } as any,
        USER,
        WORKSPACE,
        'api_key',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(pageService.forceDelete).not.toHaveBeenCalled();
  });

  it('refuses an api_key caller presenting a supersede-scoped (wrong action) confirm token', async () => {
    const confirmTokenService = new ConfirmTokenService({
      getAppSecret: () => 'x'.repeat(40),
    } as any);
    const { token } = confirmTokenService.issue({
      workspaceId: WORKSPACE.id,
      action: 'supersede',
      scopeId: 'batch-1',
      confirmingUserId: USER.id,
    });
    const { controller, pageService } = makeController({ confirmTokenService });

    await expect(
      controller.bulkDelete(
        { pageIds: ['page-1'], scopeId: 'batch-1', confirmToken: token } as any,
        USER,
        WORKSPACE,
        'api_key',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(pageService.forceDelete).not.toHaveBeenCalled();
  });

  it('allows an api_key caller presenting a valid bulk_delete-scoped confirm token', async () => {
    const confirmTokenService = new ConfirmTokenService({
      getAppSecret: () => 'x'.repeat(40),
    } as any);
    const { token } = confirmTokenService.issue({
      workspaceId: WORKSPACE.id,
      action: 'bulk_delete',
      scopeId: 'batch-1',
      confirmingUserId: USER.id,
    });
    const { controller, pageService } = makeController({ confirmTokenService });

    const result = await controller.bulkDelete(
      { pageIds: ['page-1'], scopeId: 'batch-1', confirmToken: token } as any,
      USER,
      WORKSPACE,
      'api_key',
    );

    expect(result.deletedIds).toEqual(['page-1']);
    expect(pageService.forceDelete).toHaveBeenCalledWith('page-1', WORKSPACE.id);
  });

  it('allows a human caller (no api_key authMethod) with no confirm token at all', async () => {
    const confirmTokenService = new ConfirmTokenService({
      getAppSecret: () => 'x'.repeat(40),
    } as any);
    const { controller, pageService } = makeController({ confirmTokenService });

    const result = await controller.bulkDelete(
      { pageIds: ['page-1'], scopeId: 'batch-1' } as any,
      USER,
      WORKSPACE,
      undefined,
    );

    expect(result.deletedIds).toEqual(['page-1']);
    expect(pageService.forceDelete).toHaveBeenCalledWith('page-1', WORKSPACE.id);
  });
});
