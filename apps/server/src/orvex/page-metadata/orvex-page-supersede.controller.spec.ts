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

    await controller.supersede(dto, USER, WORKSPACE, 'api_key');

    expect(metadataService.supersedeAtomic).toHaveBeenCalledWith(
      'page-1',
      { supersedes: undefined, supersededBy: 'canonical-slug' },
      {
        authMethod: 'api_key',
        actorId: USER.id,
        confirmToken: 'ct1.x.y',
        forceSupersede: undefined,
        forceReason: undefined,
      },
    );
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
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
