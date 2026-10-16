import { KyselyTransaction } from '../../../database/types/kysely.types';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService deletion resumable outbox', () => {
  function buildService(trx: object, outbox: { enqueue: jest.Mock }) {
    const service = Object.assign(Object.create(WorkspaceService.prototype), {
      outboxWriter: outbox,
    }) as WorkspaceService;
    const invoke = (
      service as unknown as {
        markDeletionResumableAfterOwnerGrant(
          transaction: KyselyTransaction,
          workspaceId: string,
        ): Promise<void>;
      }
    ).markDeletionResumableAfterOwnerGrant.bind(service);
    return () => invoke(trx as KyselyTransaction, 'workspace-now-owner');
  }

  it('enqueues a tenant-routed resumable event on the owner-change transaction', async () => {
    const candidates = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([
        {
          deletionId: '550e8400-e29b-41d4-a716-446655440000',
          orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
        },
      ]),
    };
    const remaining = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue({ count: '0' }),
    };
    const deletion = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue({
        resumableAt: new Date('2026-10-08T10:00:00.000Z'),
      }),
    };
    const deleteQuery = {
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const trx = {
      getExecutor: () => ({
        transformQuery: (query: unknown) => query,
        compileQuery: (query: unknown) => query,
        executeQuery: jest.fn().mockResolvedValue({ rows: [] }),
      }),
      executeQuery: jest.fn().mockResolvedValue({ rows: [] }),
      selectFrom: jest
        .fn()
        .mockReturnValueOnce(candidates)
        .mockReturnValueOnce(remaining),
      deleteFrom: jest.fn().mockReturnValue(deleteQuery),
      updateTable: jest.fn().mockReturnValue(deletion),
    };
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    await buildService(trx, outbox)();

    expect(outbox.enqueue).toHaveBeenCalledWith(
      trx,
      expect.objectContaining({
        type: 'identity.account.deletion.step.resumable',
        aggregateId: '550e8400-e29b-41d4-a716-446655440000',
        workspaceId: null,
        orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
        payload: {
          deletionId: '550e8400-e29b-41d4-a716-446655440000',
          step: 'wiki_delete',
          resumableAt: '2026-10-08T10:00:00.000Z',
        },
      }),
    );
    expect(
      JSON.stringify(outbox.enqueue.mock.calls[0][1].payload),
    ).not.toContain('workspace-now-owner');
  });

  it('does not enqueue when the paused-result transition did not commit', async () => {
    const candidates = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([
        {
          deletionId: '550e8400-e29b-41d4-a716-446655440000',
          orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
        },
      ]),
    };
    const remaining = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue({ count: '0' }),
    };
    const deletion = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue(undefined),
    };
    const deleteQuery = {
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const trx = {
      getExecutor: () => ({
        transformQuery: (query: unknown) => query,
        compileQuery: (query: unknown) => query,
        executeQuery: jest.fn().mockResolvedValue({ rows: [] }),
      }),
      executeQuery: jest.fn().mockResolvedValue({ rows: [] }),
      selectFrom: jest
        .fn()
        .mockReturnValueOnce(candidates)
        .mockReturnValueOnce(remaining),
      deleteFrom: jest.fn().mockReturnValue(deleteQuery),
      updateTable: jest.fn().mockReturnValue(deletion),
    };
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    await buildService(trx, outbox)();

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
