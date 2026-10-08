import { UserRepo } from './user.repo';

describe('UserRepo.recordVerifiedSubjectRef', () => {
  function setup(
    initial: Array<{ id: string; subjectRef: string | null; userId?: string }>,
    mappedOwner?: string,
  ) {
    const rows = initial.map((row) => ({ userId: 'user-1', ...row }));
    let updateCount = 0;
    let updateValue: string | undefined;
    let selectedFields: unknown;
    const selectQuery = {
      select: jest.fn((fields: unknown) => {
        selectedFields = fields;
        return selectQuery;
      }),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => rows),
      executeTakeFirst: jest.fn(async () =>
        selectedFields === 'userId'
          ? mappedOwner
            ? { userId: mappedOwner }
            : undefined
          : rows[0],
      ),
    };
    const operatorFlagQuery = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const updateQuery = {
      set: jest.fn((value: { subjectRef: string }) => {
        updateValue = value.subjectRef;
        return updateQuery;
      }),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn(async () => {
        updateCount += 1;
        const row = rows[0];
        if (!row || row.subjectRef !== null) return undefined;
        row.subjectRef = updateValue!;
        return { id: row.id };
      }),
    };
    const db = {
      selectFrom: jest.fn().mockReturnValue(selectQuery),
      updateTable: jest.fn((table: string) =>
        table === 'users' ? operatorFlagQuery : updateQuery,
      ),
    };
    return {
      repo: new UserRepo(db as never),
      rows,
      updateQuery,
      operatorFlagQuery,
      updateCount: () => updateCount,
    };
  }

  it('upserts a missing mapping once and treats the same mapping as idempotent', async () => {
    const t = setup([{ id: 'link-1', subjectRef: null }]);
    const first = await t.repo.recordVerifiedSubjectRef(
      'user-1',
      'workspace-1',
      'a'.repeat(64),
    );
    const repeated = await t.repo.recordVerifiedSubjectRef(
      'user-1',
      'workspace-1',
      'a'.repeat(64),
    );

    expect(first).toBe('recorded');
    expect(repeated).toBe('recorded');
    expect(t.rows[0].subjectRef).toBe('a'.repeat(64));
    expect(t.updateCount()).toBe(1);
  });

  it('flags a different stored reference for operator review without overwriting it', async () => {
    const existing = 'b'.repeat(64);
    const t = setup([{ id: 'link-1', subjectRef: existing }]);

    const result = await t.repo.recordVerifiedSubjectRef(
      'user-1',
      'workspace-1',
      'c'.repeat(64),
    );

    expect(result).toBe('conflict');
    expect(t.rows[0].subjectRef).toBe(existing);
    expect(t.updateCount()).toBe(0);
    expect(t.operatorFlagQuery.set).toHaveBeenCalledWith({
      subjectRefConflictAt: expect.any(Date),
    });
  });

  it('flags a reference already linked to another user in the workspace', async () => {
    const t = setup([{ id: 'link-1', subjectRef: null }], 'user-2');

    const result = await t.repo.recordVerifiedSubjectRef(
      'user-1',
      'workspace-1',
      'e'.repeat(64),
    );

    expect(result).toBe('conflict');
    expect(t.rows[0].subjectRef).toBeNull();
    expect(t.updateCount()).toBe(0);
    expect(t.operatorFlagQuery.set).toHaveBeenCalledWith({
      subjectRefConflictAt: expect.any(Date),
    });
  });

  it('does not create a mapping when the local principal has no linkage', async () => {
    const t = setup([]);

    await expect(
      t.repo.recordVerifiedSubjectRef('user-1', 'workspace-1', 'd'.repeat(64)),
    ).resolves.toBe('missing_linkage');
    expect(t.updateCount()).toBe(0);
  });
});
