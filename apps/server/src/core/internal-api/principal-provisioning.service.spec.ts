import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { acquireWorkspaceProvisionLock, executeTx } from '@docmost/db/utils';
import { withTenantScopedTransaction } from '@docmost/db/rls/rls-guc-hook';
import { RegistryClientError } from '../../orvex/http/identity-registry-client';
import { PrincipalProvisioningService } from './principal-provisioning.service';

jest.mock('@docmost/db/utils', () => ({
  acquireWorkspaceProvisionLock: jest.fn(),
  acquireWorkspaceQuotaLock: jest.fn(),
  executeTx: jest.fn(),
}));

jest.mock('@docmost/db/rls/rls-guc-hook', () => ({
  withTenantScopedTransaction: jest.fn(),
}));

describe('PrincipalProvisioningService registry transaction boundary', () => {
  const tenantId = '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Identity reserve before a Wiki transaction is opened', async () => {
    let transactionOpen = false;
    (executeTx as jest.Mock).mockImplementation(
      async (_db: unknown, callback: (trx: unknown) => Promise<unknown>) => {
        transactionOpen = true;
        try {
          return await callback({});
        } finally {
          transactionOpen = false;
        }
      },
    );
    (withTenantScopedTransaction as jest.Mock).mockImplementation(
      async (
        trx: unknown,
        _tenant: string,
        callback: (trx: unknown) => Promise<unknown>,
      ) => callback(trx),
    );
    (acquireWorkspaceProvisionLock as jest.Mock).mockResolvedValue(undefined);

    const registryClient = {
      moveTenantCell: jest.fn(),
      resolveTenantCell: jest.fn(),
      reserveTenant: jest.fn(async () => {
        expect(transactionOpen).toBe(false);
        throw new RegistryClientError(
          'DEPENDENCY_ERROR',
          'synthetic registry failure',
          'ECONNRESET',
          4,
        );
      }),
    };
    const workspaceRepo = {
      findById: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PrincipalProvisioningService(
      {} as never,
      {} as never,
      workspaceRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      registryClient as never,
      {} as never,
    );

    await expect(
      service.provision({
        subject: 'test-subject',
        tenant: tenantId,
        email: 'test@example.invalid',
        provisionWorkspace: true,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(registryClient.reserveTenant).toHaveBeenCalledTimes(1);
    expect(executeTx).not.toHaveBeenCalled();
  });

  it('maps every reserve registry error without folding authentication failures into outages', async () => {
    const cases = [
      {
        code: 'AUTH_FAILED' as const,
        exception: BadGatewayException,
        status: 502,
        responseCode: 'AUTH_FAILED',
      },
      {
        code: 'DEPENDENCY_ERROR' as const,
        exception: ServiceUnavailableException,
        status: 503,
        responseCode: 'REGISTRY_UNAVAILABLE',
      },
      {
        code: 'TENANT_ALREADY_RESERVED' as const,
        exception: ConflictException,
        status: 409,
        responseCode: 'TENANT_ALREADY_RESERVED',
      },
      {
        code: 'NOT_FOUND' as const,
        exception: ConflictException,
        status: 409,
        responseCode: 'TENANT_NOT_REGISTERED',
      },
      {
        code: 'UNKNOWN_CELL' as const,
        exception: BadRequestException,
        status: 400,
        responseCode: 'UNKNOWN_CELL',
      },
      {
        code: 'STALE_MOVE' as const,
        exception: BadGatewayException,
        status: 502,
        responseCode: 'STALE_MOVE',
      },
    ];

    for (const errorCase of cases) {
      (executeTx as jest.Mock).mockReset();
      (withTenantScopedTransaction as jest.Mock).mockReset();
      (acquireWorkspaceProvisionLock as jest.Mock).mockReset();
      const registryClient = {
        moveTenantCell: jest.fn(),
        resolveTenantCell: jest.fn(),
        reserveTenant: jest.fn(async () => {
          throw new RegistryClientError(errorCase.code, 'synthetic registry failure');
        }),
      };
      const service = new PrincipalProvisioningService(
        {} as never,
        {} as never,
        { findById: jest.fn().mockResolvedValue(undefined) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        registryClient as never,
        {} as never,
      );

      let caught: unknown;
      try {
        await service.provision({
          subject: 'test-subject',
          tenant: tenantId,
          email: 'test@example.invalid',
          provisionWorkspace: true,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(errorCase.exception);
      expect((caught as HttpException).getStatus()).toBe(errorCase.status);
      expect((caught as HttpException).getResponse()).toMatchObject({
        code: errorCase.responseCode,
      });
    }
  });
});
