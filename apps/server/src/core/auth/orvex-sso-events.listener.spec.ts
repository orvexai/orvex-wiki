import { OrvexSsoEventsListener } from './orvex-sso-events.listener';
import { UserSessionRepo } from '../../database/repos/session/user-session.repo';

/**
 * ENG-1432 AC9: the listener delegates to
 * `UserSessionRepo.revokeByWorkspaceId` — asserted via the row-effect call,
 * not an emit call-count (CS §5d).
 */
describe('OrvexSsoEventsListener', () => {
  it('calls UserSessionRepo.revokeByWorkspaceId with the event workspaceId', async () => {
    const revokeByWorkspaceId = jest.fn().mockResolvedValue(undefined);
    const repo = { revokeByWorkspaceId } as unknown as UserSessionRepo;
    const listener = new OrvexSsoEventsListener(repo);

    await listener.handleEnforceSsoToggled({ workspaceId: 'ws1' });

    expect(revokeByWorkspaceId).toHaveBeenCalledWith('ws1');
    expect(revokeByWorkspaceId).toHaveBeenCalledTimes(1);
  });
});
