import { OutboxWriter } from './outbox-writer.service';

describe('OutboxWriter tenant persistence', () => {
  const createWriter = () => {
    const insert = {
      values: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const trx = { insertInto: jest.fn().mockReturnValue(insert) };
    return { writer: new OutboxWriter({} as never), trx, insert };
  };

  it('uses the workspace id as tenant for existing workspace events', async () => {
    const { writer, trx, insert } = createWriter();

    await writer.enqueue(trx as never, {
      type: 'wiki.page.created',
      aggregateId: 'page-1',
      workspaceId: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
      payload: {},
    });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
        orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
      }),
    );
  });

  it('stores the inbound tenant without inventing a Wiki workspace FK', async () => {
    const { writer, trx, insert } = createWriter();

    await writer.enqueue(trx as never, {
      type: 'identity.account.deletion.step.acknowledged',
      aggregateId: 'deletion-1',
      workspaceId: null,
      orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
      payload: {},
    });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: null,
        orvexTenant: '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa',
      }),
    );
  });

  it('rejects a tenantless platform event before writing it', async () => {
    const { writer, trx } = createWriter();

    await expect(
      writer.enqueue(trx as never, {
        type: 'identity.account.deletion.step.acknowledged',
        aggregateId: 'deletion-1',
        workspaceId: null,
        payload: {},
      }),
    ).rejects.toThrow('Outbox events require an explicit orvexTenant');
    expect(trx.insertInto).not.toHaveBeenCalled();
  });
});
