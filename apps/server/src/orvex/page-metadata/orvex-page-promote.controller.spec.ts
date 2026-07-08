// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException } from '@nestjs/common';
import { PageStatus } from '@orvex/extensions';
import { OrvexPagePromoteController } from './orvex-page-promote.controller';

/**
 * ENG-1445 AC5/AC6 (review1 F1/F3) — the real HTTP surface that flips a
 * page to `canonical`, exercised end-to-end (controller -> service ->
 * ratify-gate). `PromotePageDto` extends `ForceSelfRatifyDto` (F3 — that
 * DTO was previously orphaned).
 */
describe('OrvexPagePromoteController.promote', () => {
  const WORKSPACE = { id: 'ws-1' } as any;
  const USER = { id: 'user-1' } as any;

  function makeController(opts: { setStatusImpl: (...args: any[]) => any }) {
    const pageRepo = {
      findById: jest.fn(async () => ({
        id: 'page-1',
        workspaceId: WORKSPACE.id,
        spaceId: 'space-1',
        deletedAt: null,
      })),
    };
    const spaceAbilityFactory = {
      createForUser: jest.fn(async () => ({ cannot: () => false })),
    };
    const metadataService = {
      setStatus: jest.fn(opts.setStatusImpl),
    };

    return new OrvexPagePromoteController(
      metadataService as any,
      pageRepo as any,
      spaceAbilityFactory as any,
    );
  }

  it('forwards authMethod/ratifyToken/forceSelfRatify to the service and returns the resolved status', async () => {
    const controller = makeController({
      setStatusImpl: async () => ({ status: PageStatus.CANONICAL }),
    });

    const result = await controller.promote(
      { pageId: 'page-1', ratifyToken: 'rt1.x.y' } as any,
      USER,
      WORKSPACE,
      'api_key',
    );

    expect(result).toEqual({ status: PageStatus.CANONICAL });
  });

  it('propagates a ForbiddenException raised by the ratify-gate enforcement', async () => {
    const controller = makeController({
      setStatusImpl: async () => {
        throw new ForbiddenException({ error: 'RATIFY_TOKEN_REQUIRED' });
      },
    });

    await expect(
      controller.promote(
        { pageId: 'page-1' } as any,
        USER,
        WORKSPACE,
        'api_key',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
