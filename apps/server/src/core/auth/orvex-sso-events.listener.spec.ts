import { OrvexSsoEventsListener } from './orvex-sso-events.listener';
import { UserSessionRepo } from '../../database/repos/session/user-session.repo';

/**
 * FakeUserSessionRepo — an owned, stateful in-memory stand-in for
 * `UserSessionRepo` (a real DB adapter, not a true external per §4f). Unlike
 * a bare `jest.fn()` spy, it holds real row state and the assertions below
 * check the ROW-EFFECT of `revokeByWorkspaceId` (which rows end up revoked
 * and which don't), not a call-count (ENG-1432 review #1, finding F2).
 * A real Postgres-backed integration test is out of scope for this port (no
 * substituted-DB test harness exists elsewhere in this repo yet); this fake
 * is the closest owned-adapter row-effect check available today.
 */
class FakeUserSessionRepo {
  rows: Array<{ id: string; workspaceId: string; revokedAt: Date | null }> = [];

  async revokeByWorkspaceId(workspaceId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.workspaceId === workspaceId && row.revokedAt === null) {
        row.revokedAt = new Date();
      }
    }
  }
}

/**
 * ENG-1432 AC9: the listener delegates to `UserSessionRepo.revokeByWorkspaceId`,
 * asserted via the row-effect on an owned, stateful fake — not an emit/call
 * count (CS §5d).
 */
describe('OrvexSsoEventsListener', () => {
  it('revokes every active session row in the toggled workspace, and only that workspace', async () => {
    const repo = new FakeUserSessionRepo();
    repo.rows = [
      { id: 's1', workspaceId: 'ws1', revokedAt: null },
      { id: 's2', workspaceId: 'ws1', revokedAt: null },
      { id: 's3', workspaceId: 'ws2', revokedAt: null },
    ];
    const listener = new OrvexSsoEventsListener(
      repo as unknown as UserSessionRepo,
    );

    await listener.handleEnforceSsoToggled({ workspaceId: 'ws1' });

    const [s1, s2, s3] = repo.rows;
    expect(s1.revokedAt).not.toBeNull();
    expect(s2.revokedAt).not.toBeNull();
    expect(s3.revokedAt).toBeNull(); // untouched: different workspace
  });

  it('leaves an already-revoked row alone (idempotent on revokedAt)', async () => {
    const repo = new FakeUserSessionRepo();
    const already = new Date('2020-01-01T00:00:00.000Z');
    repo.rows = [{ id: 's1', workspaceId: 'ws1', revokedAt: already }];
    const listener = new OrvexSsoEventsListener(
      repo as unknown as UserSessionRepo,
    );

    await listener.handleEnforceSsoToggled({ workspaceId: 'ws1' });

    expect(repo.rows[0].revokedAt).toBe(already);
  });
});
