// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { UnauthorizedException } from '@nestjs/common';
import {
  EdgeAssertionVerifierPort,
  OrvexSessionMintService,
} from './orvex-session-mint.service';
import {
  IdentityIntrospector,
  IntrospectedPrincipal,
} from './identity-introspector';
import {
  EdgeAssertionClaims,
  EdgeAssertionVerificationError,
} from '../../orvex/edge-auth/edge-assertion.types';

// ── Test doubles (the load-bearing collaborators; the DB repos are already
// proven by the internal-api testcontainers surface, so here we drive the
// service's verify→resolve→mint SEQUENCING and its deny-by-default gates). ──

class FakeIntrospector implements IdentityIntrospector {
  public lastToken: string | undefined;
  constructor(
    private readonly result:
      | IntrospectedPrincipal
      | null
      | (() => Promise<never>),
  ) {}
  introspect(token: string): Promise<IntrospectedPrincipal | null> {
    this.lastToken = token;
    if (typeof this.result === 'function') return this.result();
    return Promise.resolve(this.result);
  }
}

class FakeEdgeVerifier implements EdgeAssertionVerifierPort {
  public lastToken: string | undefined;
  constructor(
    private readonly result: EdgeAssertionClaims | (() => Promise<never>),
  ) {}
  verify(token: string): Promise<EdgeAssertionClaims> {
    this.lastToken = token;
    if (typeof this.result === 'function') return this.result();
    return Promise.resolve(this.result);
  }
}

// A well-formed aud=orvex-wiki assertion's claims. `tenant` IS the engine
// workspace UUID (ENG-1559), so it resolves the SAME linkage as the introspect
// PRINCIPAL below — proving both credentials share the resolve→mint tail.
const ASSERTION_CLAIMS: EdgeAssertionClaims = {
  sub: 'sub-abc',
  tenant: 'ws-uuid-A',
  cell: 'eu1a',
  cellEpoch: 0,
  scope: '',
  aud: ['orvex-wiki'],
  iss: 'https://identity.edge.orvex.internal/edge-authn',
  iat: 1_000,
  exp: 9_999_999_999,
};

type UserRow = {
  id: string;
  workspaceId: string;
  deactivatedAt?: Date | null;
  deletedAt?: Date | null;
};

function makeService(opts: {
  principal: IntrospectedPrincipal | null | (() => Promise<never>);
  assertion?: EdgeAssertionClaims | (() => Promise<never>);
  resolvedUserId?: string | undefined;
  user?: UserRow | undefined;
}) {
  const introspector = new FakeIntrospector(opts.principal);
  const edgeVerifier = new FakeEdgeVerifier(opts.assertion ?? ASSERTION_CLAIMS);

  const findUserIdByProviderUserId = jest
    .fn<Promise<string | undefined>, [string, string]>()
    .mockResolvedValue(opts.resolvedUserId);
  const findById = jest
    .fn<Promise<UserRow | undefined>, [string, string]>()
    .mockResolvedValue(opts.user);
  const userRepo = { findUserIdByProviderUserId, findById };

  const createSessionAndToken = jest
    .fn<Promise<string>, [UserRow]>()
    .mockResolvedValue('minted-access-token');
  const sessionService = { createSessionAndToken };

  const expiresAt = new Date('2026-07-12T00:00:00.000Z');
  const environmentService = { getCookieExpiresIn: () => expiresAt };

  const logWithContext = jest.fn();
  const auditService = { logWithContext };

  const service = new OrvexSessionMintService(
    introspector,
    edgeVerifier,
    // Only the two methods the service calls are needed on the fakes.
    userRepo as never,
    sessionService as never,
    environmentService as never,
    auditService as never,
  );

  return {
    service,
    introspector,
    edgeVerifier,
    findUserIdByProviderUserId,
    findById,
    createSessionAndToken,
    logWithContext,
    expiresAt,
  };
}

const PRINCIPAL: IntrospectedPrincipal = {
  subject: 'sub-abc',
  workspaceId: 'ws-uuid-A',
};

describe('OrvexSessionMintService', () => {
  it('HAPPY PATH — verify → resolve → mint; returns scoped result, sets no cross-tenant leak', async () => {
    const t = makeService({
      principal: PRINCIPAL,
      resolvedUserId: 'user-1',
      user: { id: 'user-1', workspaceId: 'ws-uuid-A' },
    });

    const minted = await t.service.mintSession('opaque-token');

    expect(minted).toEqual({
      accessToken: 'minted-access-token',
      sub: 'sub-abc',
      workspaceId: 'ws-uuid-A',
      expiresAt: t.expiresAt,
    });
    // The token was introspected, not trusted unverified.
    expect(t.introspector.lastToken).toBe('opaque-token');
    // TENANT ISOLATION — resolution is scoped to the INTROSPECTED workspace.
    expect(t.findUserIdByProviderUserId).toHaveBeenCalledWith(
      'sub-abc',
      'ws-uuid-A',
    );
    expect(t.findById).toHaveBeenCalledWith('user-1', 'ws-uuid-A');
    expect(t.createSessionAndToken).toHaveBeenCalledTimes(1);
  });

  it('audits a successful mint WITHOUT the token bytes (subject only)', async () => {
    const t = makeService({
      principal: PRINCIPAL,
      resolvedUserId: 'user-1',
      user: { id: 'user-1', workspaceId: 'ws-uuid-A' },
    });
    await t.service.mintSession('super-secret-token');

    expect(t.logWithContext).toHaveBeenCalledTimes(1);
    const [payload, context] = t.logWithContext.mock.calls[0];
    expect(payload.metadata).toEqual({
      source: 'session-exchange',
      subject: 'sub-abc',
    });
    expect(context).toMatchObject({
      workspaceId: 'ws-uuid-A',
      actorId: 'user-1',
      actorType: 'user',
    });
    // Secret discipline: the exchange token never reaches the audit record.
    expect(JSON.stringify(t.logWithContext.mock.calls[0])).not.toContain(
      'super-secret-token',
    );
  });

  it('DENY — a rejected token (null principal) → 401, no resolve/mint', async () => {
    const t = makeService({ principal: null });
    await expect(t.service.mintSession('t')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(t.findUserIdByProviderUserId).not.toHaveBeenCalled();
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
    expect(t.logWithContext).not.toHaveBeenCalled();
  });

  it('DENY — an UNPROVISIONED subject (no auth_accounts linkage) → 401, no mint (no create-on-resolve)', async () => {
    const t = makeService({ principal: PRINCIPAL, resolvedUserId: undefined });
    await expect(t.service.mintSession('t')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(t.findUserIdByProviderUserId).toHaveBeenCalledWith(
      'sub-abc',
      'ws-uuid-A',
    );
    expect(t.findById).not.toHaveBeenCalled();
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
    expect(t.logWithContext).not.toHaveBeenCalled();
  });

  it('DENY — a resolved-but-missing user row → 401', async () => {
    const t = makeService({
      principal: PRINCIPAL,
      resolvedUserId: 'user-1',
      user: undefined,
    });
    await expect(t.service.mintSession('t')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('DENY — a disabled (deactivated) resolved user → 401', async () => {
    const t = makeService({
      principal: PRINCIPAL,
      resolvedUserId: 'user-1',
      user: {
        id: 'user-1',
        workspaceId: 'ws-uuid-A',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await expect(t.service.mintSession('t')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('PROPAGATES an introspection dependency failure (honest 5xx, not a silent deny)', async () => {
    const boom = () => Promise.reject(new Error('introspect seam down'));
    const t = makeService({ principal: boom });
    await expect(t.service.mintSession('t')).rejects.toThrow(
      'introspect seam down',
    );
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
  });
});

describe('OrvexSessionMintService.mintSessionFromAssertion (ADR-0049 S2S)', () => {
  it('HAPPY PATH — verify assertion → resolve → mint; sub/tenant come from the CLAIMS, not introspect', async () => {
    const t = makeService({
      // The introspect path must NOT run on the assertion path — set it to
      // throw so any accidental fall-through to introspect fails loudly.
      principal: () => Promise.reject(new Error('introspect must not be called')),
      assertion: ASSERTION_CLAIMS,
      resolvedUserId: 'user-1',
      user: { id: 'user-1', workspaceId: 'ws-uuid-A' },
    });

    const minted = await t.service.mintSessionFromAssertion('edge.assertion.jws');

    expect(minted).toEqual({
      accessToken: 'minted-access-token',
      sub: 'sub-abc',
      workspaceId: 'ws-uuid-A',
      expiresAt: t.expiresAt,
    });
    // The assertion was verified, not trusted unverified.
    expect(t.edgeVerifier.lastToken).toBe('edge.assertion.jws');
    // TENANT ISOLATION — resolution is scoped to the assertion's `tenant`.
    expect(t.findUserIdByProviderUserId).toHaveBeenCalledWith(
      'sub-abc',
      'ws-uuid-A',
    );
    expect(t.findById).toHaveBeenCalledWith('user-1', 'ws-uuid-A');
    expect(t.createSessionAndToken).toHaveBeenCalledTimes(1);
  });

  it('audits with source=session-exchange-assertion, subject only, and NO assertion bytes', async () => {
    const t = makeService({
      principal: () => Promise.reject(new Error('introspect must not be called')),
      assertion: ASSERTION_CLAIMS,
      resolvedUserId: 'user-1',
      user: { id: 'user-1', workspaceId: 'ws-uuid-A' },
    });
    await t.service.mintSessionFromAssertion('super-secret.assertion.jws');

    expect(t.logWithContext).toHaveBeenCalledTimes(1);
    const [payload, context] = t.logWithContext.mock.calls[0];
    expect(payload.metadata).toEqual({
      source: 'session-exchange-assertion',
      subject: 'sub-abc',
    });
    expect(context).toMatchObject({
      workspaceId: 'ws-uuid-A',
      actorId: 'user-1',
      actorType: 'user',
    });
    // Secret discipline: the assertion never reaches the audit record.
    expect(JSON.stringify(t.logWithContext.mock.calls[0])).not.toContain(
      'super-secret.assertion.jws',
    );
  });

  it('DENY — a verification rejection (EdgeAssertionVerificationError) → 401, no resolve/mint, no leak of the code', async () => {
    const t = makeService({
      principal: null,
      assertion: () =>
        Promise.reject(new EdgeAssertionVerificationError('AUDIENCE_REJECTED')),
    });
    const err = await t.service
      .mintSessionFromAssertion('wrong-aud.jws')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    // The stable verification code is not surfaced to the caller.
    expect((err as Error).message).not.toContain('AUDIENCE_REJECTED');
    expect(t.findUserIdByProviderUserId).not.toHaveBeenCalled();
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
    expect(t.logWithContext).not.toHaveBeenCalled();
  });

  it('DENY — an UNPROVISIONED subject from a VALID assertion → 401, no mint (no create-on-resolve)', async () => {
    const t = makeService({
      principal: null,
      assertion: ASSERTION_CLAIMS,
      resolvedUserId: undefined,
    });
    await expect(
      t.service.mintSessionFromAssertion('valid.jws'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.findUserIdByProviderUserId).toHaveBeenCalledWith(
      'sub-abc',
      'ws-uuid-A',
    );
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
    expect(t.logWithContext).not.toHaveBeenCalled();
  });

  it('PROPAGATES a NOT_CONFIGURED / transport failure as an honest 5xx (a NON-verification error is rethrown, not mapped to 401)', async () => {
    const notConfigured = () =>
      Promise.reject(new Error('edge verification is not configured'));
    const t = makeService({ principal: null, assertion: notConfigured });
    const err = await t.service
      .mintSessionFromAssertion('x.jws')
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toContain('not configured');
    expect(t.createSessionAndToken).not.toHaveBeenCalled();
  });
});
