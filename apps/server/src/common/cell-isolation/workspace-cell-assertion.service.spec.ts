import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import {
  WorkspaceCellAssertionService,
  WorkspaceCellMismatchException,
} from './workspace-cell-assertion.service';

function build(env: Record<string, string>, workspaceCellId: string | null) {
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue({ cellId: workspaceCellId }),
  };
  return new WorkspaceCellAssertionService(
    workspaceRepo as any,
    { isCloud: () => true } as any,
    new OrvexConfigService(env as NodeJS.ProcessEnv),
  );
}

describe('WorkspaceCellAssertionService deployment cell (AD-36)', () => {
  it('admits the solo sentinel on an explicitly crew deployment', async () => {
    const svc = build({ CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'crew' }, 'solo');
    await expect(
      svc.assertWorkspaceId('ws-1', 'internal principals/provision'),
    ).resolves.toBeUndefined();
  });

  it('admits the solo sentinel on a preview deployment', async () => {
    const svc = build(
      { CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'preview' },
      'solo',
    );
    await expect(svc.assertWorkspaceId('ws-1', 's')).resolves.toBeUndefined();
  });

  it.each([
    [{ CELL_ID: 'solo' }],
    [{ CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'prod' }],
    [{ CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'staging' }],
    [{ CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'CREW-ish' }],
    [{ ORVEX_ENVIRONMENT: 'crew' }],
  ])(
    'fails closed on solo/absent cell outside crew/preview: %o',
    async (env) => {
      const svc = build(env, 'solo');
      await expect(svc.assertWorkspaceId('ws-1', 's')).rejects.toMatchObject({
        mismatch: { reason: 'DEPLOYMENT_CELL_ABSENT' },
      });
    },
  );

  it('crew solo still rejects a workspace born in another cell', async () => {
    const svc = build({ CELL_ID: 'solo', ORVEX_ENVIRONMENT: 'crew' }, 'eu1a');
    await expect(svc.assertWorkspaceId('ws-1', 's')).rejects.toBeInstanceOf(
      WorkspaceCellMismatchException,
    );
  });

  it('real cells are unaffected by ORVEX_ENVIRONMENT', async () => {
    const svc = build({ CELL_ID: 'eu1a', ORVEX_ENVIRONMENT: 'prod' }, 'eu1a');
    await expect(svc.assertWorkspaceId('ws-1', 's')).resolves.toBeUndefined();
  });
});
