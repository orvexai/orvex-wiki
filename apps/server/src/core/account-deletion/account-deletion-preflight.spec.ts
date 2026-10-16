// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { UnauthorizedException } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceCellAssertionService } from '../../common/cell-isolation/workspace-cell-assertion.service';
import { EdgeAssertionClaims, EdgeAssertionVerificationError } from '../../orvex/edge-auth/edge-assertion.types';
import { AccountDeletionPreflightController } from './account-deletion-preflight.controller';
import { AccountDeletionPreflightService } from './account-deletion-preflight.service';

const claims: EdgeAssertionClaims = {
  sub: 'verified-user-subject-secret',
  tenant: '11111111-1111-4111-8111-111111111111',
  cell: 'crew-yafet',
  cellEpoch: 1,
  scope: '',
  aud: ['orvex-wiki'],
  iss: 'https://identity.edge.orvex.internal/edge-authn',
  iat: 1_000,
  exp: 9_999_999_999,
};

function makeService(blockingWorkspaces: Array<{ workspaceId: string; name: string | null }>) {
  const userRepo = {
    findUserIdByProviderUserId: jest.fn().mockResolvedValue('wiki-user-id'),
    findDeletionBlockingWorkspaces: jest.fn().mockResolvedValue(blockingWorkspaces),
  } as unknown as UserRepo;
  return {
    service: new AccountDeletionPreflightService(userRepo),
    userRepo,
  };
}

describe('AccountDeletionPreflightService', () => {
  it('returns proceed when no workspace is blocked', async () => {
    const { service, userRepo } = makeService([]);

    await expect(
      service.check(claims.sub, claims.tenant),
    ).resolves.toEqual({ result: 'proceed', blockingWorkspaces: [] });
    expect(userRepo.findUserIdByProviderUserId).toHaveBeenCalledWith(
      claims.sub,
      claims.tenant,
    );
  });

  it('returns only sole-owner workspaces that still have other members', async () => {
    const blockers = [
      {
        workspaceId: '22222222-2222-4222-8222-222222222222',
        name: 'Shared space',
      },
    ];
    const { service } = makeService(blockers);

    const result = await service.check(claims.sub, claims.tenant);

    expect(result).toEqual({
      result: 'ownership_transfer_required',
      blockingWorkspaces: blockers,
    });
    const wire = JSON.stringify(result);
    expect(wire).not.toContain(claims.sub);
    expect(wire).not.toContain('member@example.test');
    expect(wire).not.toContain('subjectRef');
  });

  it('returns a contract-valid display name for a legacy workspace with no name', async () => {
    const { service } = makeService([
      {
        workspaceId: '22222222-2222-4222-8222-222222222222',
        name: null,
      },
    ]);

    await expect(service.check(claims.sub, claims.tenant)).resolves.toEqual({
      result: 'ownership_transfer_required',
      blockingWorkspaces: [
        {
          workspaceId: '22222222-2222-4222-8222-222222222222',
          name: 'Untitled workspace',
        },
      ],
    });
  });

  it('fails closed when the verified personal workspace principal is absent', async () => {
    const { service, userRepo } = makeService([]);
    jest
      .mocked(userRepo.findUserIdByProviderUserId)
      .mockResolvedValue(undefined);

    await expect(service.check(claims.sub, claims.tenant)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userRepo.findDeletionBlockingWorkspaces).not.toHaveBeenCalled();
  });
});

describe('AccountDeletionPreflightController', () => {
  it('requires and verifies an ADR-0049 assertion; derives sub and tenant only from verified claims', async () => {
    const verifier = { verify: jest.fn().mockResolvedValue(claims) };
    const cellAssertion = { assertWorkspaceId: jest.fn().mockResolvedValue(undefined) };
    const preflight = { check: jest.fn().mockResolvedValue({ result: 'proceed', blockingWorkspaces: [] }) };
    const controller = new AccountDeletionPreflightController(
      verifier as never,
      cellAssertion as unknown as WorkspaceCellAssertionService,
      preflight as unknown as AccountDeletionPreflightService,
    );

    await expect(controller.check(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.verify).not.toHaveBeenCalled();

    await expect(controller.check(' signed-assertion ')).resolves.toEqual({
      result: 'proceed',
      blockingWorkspaces: [],
    });
    expect(verifier.verify).toHaveBeenCalledWith('signed-assertion');
    expect(cellAssertion.assertWorkspaceId).toHaveBeenCalledWith(
      claims.tenant,
      'internal account-deletion/preflight',
    );
    expect(preflight.check).toHaveBeenCalledWith(claims.sub, claims.tenant);
  });

  it('maps assertion verdicts to 401 and does not leak verifier details', async () => {
    const verifier = {
      verify: jest
        .fn()
        .mockRejectedValue(new EdgeAssertionVerificationError('MALFORMED')),
    };
    const controller = new AccountDeletionPreflightController(
      verifier as never,
      { assertWorkspaceId: jest.fn() } as unknown as WorkspaceCellAssertionService,
      { check: jest.fn() } as unknown as AccountDeletionPreflightService,
    );

    await expect(controller.check('bad-token')).rejects.toMatchObject({
      status: 401,
      response: { message: 'user assertion rejected' },
    });
  });
});
