import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtType } from '../dto/jwt-payload';

/**
 * ENG-1380 / AC9 — pure unit test of the dispatch seam: a `type=api_key`
 * payload resolves `{user, workspace, authMethod:'api_key', apiKeyId}`
 * through `ApiKeyService` (stubbed here — the true store/hash behaviour is
 * covered end-to-end by `OrvexApiKeyAuthContractSpec`); a `type=access`
 * payload is completely unaffected by that branch.
 */
describe('JwtStrategy — api-key dispatch (AC9)', () => {
  const workspace = { id: 'ws-1', name: 'ws' };
  const user = { id: 'user-1', workspaceId: 'ws-1' };

  function buildStrategy(apiKeyServiceOverrides: Partial<{ validate: any }> = {}) {
    const userRepo = { findById: jest.fn().mockResolvedValue(user) };
    const workspaceRepo = { findById: jest.fn().mockResolvedValue(workspace) };
    const userSessionRepo = { findActiveById: jest.fn() };
    const sessionActivityService = { trackActivity: jest.fn() };
    const environmentService = { getAppSecret: () => 'secret-at-least-32-characters-long' };
    const apiKeyService = {
      validate: jest.fn().mockResolvedValue({
        apiKeyId: 'key-1',
        creatorId: 'user-1',
        workspaceId: 'ws-1',
      }),
      ...apiKeyServiceOverrides,
    };

    const strategy = new JwtStrategy(
      userRepo as any,
      workspaceRepo as any,
      userSessionRepo as any,
      sessionActivityService as any,
      environmentService as any,
      apiKeyService as any,
    );
    return { strategy, userRepo, workspaceRepo, apiKeyService };
  }

  it('resolves {user, workspace, authMethod, apiKeyId} for type=api_key', async () => {
    const { strategy, apiKeyService } = buildStrategy();
    const req = { raw: {}, headers: { authorization: 'Bearer raw-token' } };

    const result = await strategy.validate(req, {
      sub: 'user-1',
      workspaceId: 'ws-1',
      apiKeyId: 'key-1',
      type: JwtType.API_KEY,
    } as any);

    expect(apiKeyService.validate).toHaveBeenCalledWith(
      { apiKeyId: 'key-1', workspaceId: 'ws-1' },
      'raw-token',
    );
    expect(result).toMatchObject({
      user,
      workspace,
      authMethod: 'api_key',
      apiKeyId: 'key-1',
      tokenScope: 'full',
    });
  });

  it('propagates the restricted scope marker for type=api_key', async () => {
    const { strategy } = buildStrategy();
    const req = { raw: {}, headers: { authorization: 'Bearer raw-token' } };

    const result: any = await strategy.validate(req, {
      sub: 'user-1',
      workspaceId: 'ws-1',
      apiKeyId: 'key-1',
      type: JwtType.API_KEY,
      scope: 'restricted',
    } as any);

    expect(result.tokenScope).toBe('restricted');
  });

  it('a type=session (access) JWT never touches ApiKeyService', async () => {
    const { strategy, apiKeyService } = buildStrategy();
    const req = { raw: {}, headers: {} };

    const result: any = await strategy.validate(req, {
      sub: 'user-1',
      email: 'a@example.com',
      workspaceId: 'ws-1',
      type: 'access',
    } as any);

    expect(apiKeyService.validate).not.toHaveBeenCalled();
    expect(result).toEqual({ user, workspace, tokenScope: 'full' });
  });

  it('propagates an ApiKeyService rejection as-is (fail-closed)', async () => {
    const { strategy } = buildStrategy({
      validate: jest.fn().mockRejectedValue(new UnauthorizedException('API key revoked')),
    });
    const req = { raw: {}, headers: { authorization: 'Bearer x' } };

    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        workspaceId: 'ws-1',
        apiKeyId: 'key-1',
        type: JwtType.API_KEY,
      } as any),
    ).rejects.toThrow('API key revoked');
  });
});
