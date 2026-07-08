// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PageStatus } from '@orvex/extensions';
import { OrvexPageSupersedeController } from './orvex-page-supersede.controller';
import { User, Workspace } from '../../database/types/entity.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { SupersedePageDto } from './dto/supersede-page.dto';

/**
 * ENG-1434 — thin-controller unit coverage: forwards the caller context
 * (authMethod/confirmToken/forceSupersede) to the real chokepoint
 * (`OrvexPageMetadataService.supersedeAtomic`, exercised for real in
 * `orvex-page-supersede.integration.spec.ts`) and enforces workspace/space
 * scoping BEFORE ever calling it. Mirrors
 * `orvex-page-promote.controller.spec.ts` (ENG-1445).
 */
describe('OrvexPageSupersedeController', () => {
  const WORKSPACE = { id: 'ws-1' } as Workspace;
  const USER = { id: 'user-1' } as User;

  function makeController(opts: {
    supersedeImpl?: () => Promise<unknown>;
    findByIdImpl?: () => Promise<unknown>;
    canManage?: boolean;
  }) {
    const pageRepo: Pick<PageRepo, 'findById'> = {
      findById: jest.fn(
        opts.findByIdImpl ??
          (async () => ({
            id: 'page-1',
            workspaceId: WORKSPACE.id,
            spaceId: 'space-1',
            deletedAt: null,
          })),
      ) as unknown as PageRepo['findById'],
    };
    const spaceAbilityFactory: Pick<SpaceAbilityFactory, 'createForUser'> = {
      createForUser: jest.fn(async () => ({
        cannot: () => opts.canManage === false,
      })) as unknown as SpaceAbilityFactory['createForUser'],
    };
    const metadataService: Pick<OrvexPageMetadataService, 'supersedeAtomic'> = {
      supersedeAtomic: jest.fn(
        opts.supersedeImpl ?? (async () => ({ status: PageStatus.SUPERSEDED })),
      ) as unknown as OrvexPageMetadataService['supersedeAtomic'],
    };

    return {
      controller: new OrvexPageSupersedeController(
        metadataService as OrvexPageMetadataService,
        pageRepo as PageRepo,
        spaceAbilityFactory as SpaceAbilityFactory,
      ),
      metadataService,
    };
  }

  it('forwards pageId/direction/confirmToken/forceSupersede to supersedeAtomic', async () => {
    const { controller, metadataService } = makeController({});

    const dto: SupersedePageDto = {
      pageId: 'page-1',
      supersededBy: 'canonical-slug',
      confirmToken: 'ct1.x.y',
    } as SupersedePageDto;

    await controller.supersede(dto, USER, WORKSPACE, 'api_key', 'apikey-1');

    expect(metadataService.supersedeAtomic).toHaveBeenCalledWith(
      'page-1',
      { supersedes: undefined, supersededBy: 'canonical-slug' },
      {
        authMethod: 'api_key',
        actorId: USER.id,
        confirmToken: 'ct1.x.y',
        forceSupersede: undefined,
        forceReason: undefined,
        clientId: 'apikey-1',
        authorizeTargetSpace: expect.any(Function),
      },
    );
  });

  it('review1 F1: authorizeTargetSpace re-runs the same space-CASL Manage check against the resolved target space', async () => {
    const pageRepo: Pick<PageRepo, 'findById'> = {
      findById: jest.fn(async () => ({
        id: 'page-1',
        workspaceId: WORKSPACE.id,
        spaceId: 'space-1',
        deletedAt: null,
      })) as unknown as PageRepo['findById'],
    };
    const canManageMock = jest.fn(async () => ({ cannot: () => false }));
    const spaceAbilityFactory: Pick<SpaceAbilityFactory, 'createForUser'> = {
      createForUser: canManageMock as unknown as SpaceAbilityFactory['createForUser'],
    };
    const metadataService: Pick<OrvexPageMetadataService, 'supersedeAtomic'> = {
      supersedeAtomic: jest.fn(async (_pageId, _direction, gate) => {
        await (
          gate as unknown as { authorizeTargetSpace: (s: string) => Promise<void> }
        ).authorizeTargetSpace('target-space-99');
        return { status: PageStatus.SUPERSEDED };
      }) as unknown as OrvexPageMetadataService['supersedeAtomic'],
    };
    const controller = new OrvexPageSupersedeController(
      metadataService as OrvexPageMetadataService,
      pageRepo as PageRepo,
      spaceAbilityFactory as SpaceAbilityFactory,
    );

    await controller.supersede(
      { pageId: 'page-1', supersededBy: 'x' } as SupersedePageDto,
      USER,
      WORKSPACE,
      undefined,
      undefined,
    );

    // Once for the requesting page's own space ('space-1'), once (via the
    // callback the service invoked) for the resolved target's space.
    expect(canManageMock).toHaveBeenCalledWith(USER, 'space-1');
    expect(canManageMock).toHaveBeenCalledWith(USER, 'target-space-99');
  });

  it('review1 F1: authorizeTargetSpace rejects when the caller cannot Manage the resolved target space', async () => {
    const pageRepo: Pick<PageRepo, 'findById'> = {
      findById: jest.fn(async () => ({
        id: 'page-1',
        workspaceId: WORKSPACE.id,
        spaceId: 'space-1',
        deletedAt: null,
      })) as unknown as PageRepo['findById'],
    };
    const spaceAbilityFactory: Pick<SpaceAbilityFactory, 'createForUser'> = {
      createForUser: jest.fn(async (_user, spaceId: string) => ({
        cannot: () => spaceId === 'target-space-99',
      })) as unknown as SpaceAbilityFactory['createForUser'],
    };
    const metadataService: Pick<OrvexPageMetadataService, 'supersedeAtomic'> = {
      supersedeAtomic: jest.fn(async (_pageId, _direction, gate) => {
        await (
          gate as unknown as { authorizeTargetSpace: (s: string) => Promise<void> }
        ).authorizeTargetSpace('target-space-99');
        return { status: PageStatus.SUPERSEDED };
      }) as unknown as OrvexPageMetadataService['supersedeAtomic'],
    };
    const controller = new OrvexPageSupersedeController(
      metadataService as OrvexPageMetadataService,
      pageRepo as PageRepo,
      spaceAbilityFactory as SpaceAbilityFactory,
    );

    await expect(
      controller.supersede(
        { pageId: 'page-1', supersededBy: 'x' } as SupersedePageDto,
        USER,
        WORKSPACE,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the page is not in the caller workspace', async () => {
    const { controller } = makeController({
      findByIdImpl: async () => ({
        id: 'page-1',
        workspaceId: 'other-ws',
        spaceId: 'space-1',
        deletedAt: null,
      }),
    });

    await expect(
      controller.supersede(
        { pageId: 'page-1', supersededBy: 'x' } as SupersedePageDto,
        USER,
        WORKSPACE,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s when the caller cannot manage the page space', async () => {
    const { controller } = makeController({ canManage: false });

    await expect(
      controller.supersede(
        { pageId: 'page-1', supersededBy: 'x' } as SupersedePageDto,
        USER,
        WORKSPACE,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propagates a ForbiddenException raised by the supersede gate', async () => {
    const { controller } = makeController({
      supersedeImpl: async () => {
        throw new ForbiddenException({ error: 'CONFIRM_TOKEN_REQUIRED' });
      },
    });

    await expect(
      controller.supersede(
        { pageId: 'page-1', supersededBy: 'x' } as SupersedePageDto,
        USER,
        WORKSPACE,
        'api_key',
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
