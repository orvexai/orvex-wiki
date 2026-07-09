import { OrvexAuditActorResolver } from './orvex-audit-actor.resolver';

/**
 * ENG-1396 (AC6) — actor resolver classifies external agents. Pure/in-
 * process: no mock needed (CS §4f).
 */
describe('OrvexAuditActorResolver', () => {
  const resolver = new OrvexAuditActorResolver();

  it('returns external_agent + clientId for an api_key-authenticated request', () => {
    const result = resolver.resolve(
      { id: 'user-1' },
      { authMethod: 'api_key', apiKeyId: 'key-123' },
    );
    expect(result).toEqual({
      actorType: 'external_agent',
      actorId: 'user-1',
      clientId: 'key-123',
    });
  });

  it('returns user + null clientId for a non-api_key request', () => {
    const result = resolver.resolve({ id: 'user-1' }, { authMethod: undefined });
    expect(result).toEqual({
      actorType: 'user',
      actorId: 'user-1',
      clientId: null,
    });
  });

  it('returns user + null clientId when req is absent (e.g. an internal system call)', () => {
    const result = resolver.resolve({ id: 'user-1' }, undefined);
    expect(result).toEqual({
      actorType: 'user',
      actorId: 'user-1',
      clientId: null,
    });
  });
});
