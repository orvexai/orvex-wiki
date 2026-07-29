// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpException, UnauthorizedException } from '@nestjs/common';

import {
  MintedSession,
  OrvexSessionMintService,
} from './orvex-session-mint.service';
import { OrvexSessionExchangeController } from './orvex-session-exchange.controller';
import { SessionExchangeRequestDto } from '../../orvex/http/dto/session-exchange.dto';

/**
 * ENG-3063 VERIFY+HARDEN — unit pins for the controller's DUAL-ACCEPT routing
 * (ADR-0049 S2S step 1) and the 401-never-421 delivery seam. The mint logic
 * itself is proven in orvex-session-mint.service.spec.ts and end-to-end in the
 * ENG-2499 integration suite; what had NO coverage was the controller's own
 * credential-pick branching:
 *   - `X-Orvex-Assertion` wins when BOTH credentials are present,
 *   - a blank/whitespace header falls through to the body token,
 *   - NEITHER credential -> deny-by-default 401 (never a schema 400),
 *   - a service rejection surfaces as a STRUCTURED 401 — and can never be a
 *     421, because the engine has no 421 concept anywhere in this path
 *     (AD-13: the cell guard is the edge's/wiki-api's, not the engine's).
 *
 * The service is substituted at its REAL exported surface (a `Pick`-shaped
 * stand-in, never jest.mock of the module under test — ❌#4); the cookie seam
 * (`setAuthCookie`) is exercised for real against a recording reply double.
 */

const MINTED: MintedSession = {
  accessToken: 'minted-access-token',
  sub: 'sub-abc',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  expiresAt: new Date('2026-07-12T00:00:00.000Z'),
};

function makeController(opts: {
  fromAssertion?: () => Promise<MintedSession>;
  fromToken?: () => Promise<MintedSession>;
}) {
  const mintSessionFromAssertion = jest.fn(
    opts.fromAssertion ??
      (() =>
        Promise.reject(new Error('mintSessionFromAssertion must not be called'))),
  );
  const mintSession = jest.fn(
    opts.fromToken ??
      (() => Promise.reject(new Error('mintSession must not be called'))),
  );
  const mintService = {
    mintSessionFromAssertion,
    mintSession,
  } as unknown as OrvexSessionMintService;

  const environmentService = {
    getCookieExpiresIn: () => MINTED.expiresAt,
    isHttps: () => false,
  };

  const setCookie = jest.fn();
  const res = { setCookie } as never;

  const controller = new OrvexSessionExchangeController(
    mintService,
    environmentService as never,
  );

  return { controller, mintSessionFromAssertion, mintSession, setCookie, res };
}

function dto(exchangeToken?: string): SessionExchangeRequestDto {
  const d = new SessionExchangeRequestDto();
  d.exchangeToken = exchangeToken;
  return d;
}

describe('OrvexSessionExchangeController (dual-accept routing)', () => {
  it('routes an X-Orvex-Assertion header to the ASSERTION path, sets the authToken cookie, and returns the bare contract body', async () => {
    const t = makeController({ fromAssertion: () => Promise.resolve(MINTED) });

    const body = await t.controller.exchange(dto(), ' edge.assertion.jws ', t.res);

    // The header is trimmed before verification, never passed raw.
    expect(t.mintSessionFromAssertion).toHaveBeenCalledWith('edge.assertion.jws');
    expect(t.mintSession).not.toHaveBeenCalled();
    // DELIVERY — the one shared cookie chokepoint, with the minted token.
    expect(t.setCookie).toHaveBeenCalledTimes(1);
    expect(t.setCookie).toHaveBeenCalledWith(
      'authToken',
      'minted-access-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    // Bare contract shape (@SkipTransform): fields directly, ISO expiry.
    expect(body).toEqual({
      sub: 'sub-abc',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-12T00:00:00.000Z',
    });
  });

  it('the assertion WINS when both credentials are present (the introspect shim is never consulted)', async () => {
    const t = makeController({ fromAssertion: () => Promise.resolve(MINTED) });

    await t.controller.exchange(dto('opaque-token-also-sent'), 'edge.assertion.jws', t.res);

    expect(t.mintSessionFromAssertion).toHaveBeenCalledWith('edge.assertion.jws');
    expect(t.mintSession).not.toHaveBeenCalled();
  });

  it('a WHITESPACE-only assertion header falls through to the (transient) body-token path', async () => {
    const t = makeController({ fromToken: () => Promise.resolve(MINTED) });

    await t.controller.exchange(dto(' opaque-token '), '   ', t.res);

    expect(t.mintSession).toHaveBeenCalledWith('opaque-token');
    expect(t.mintSessionFromAssertion).not.toHaveBeenCalled();
  });

  it('NEITHER credential -> deny-by-default 401 (never a schema 400), no mint attempted, no cookie set', async () => {
    const t = makeController({});

    const err = await t.controller
      .exchange(dto(undefined), undefined, t.res)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as HttpException).getStatus()).toBe(401);
    expect(t.mintSession).not.toHaveBeenCalled();
    expect(t.mintSessionFromAssertion).not.toHaveBeenCalled();
    expect(t.setCookie).not.toHaveBeenCalled();
  });

  it('a service-side verification rejection surfaces as a STRUCTURED 401 — never 421, never a blank body, no cookie', async () => {
    const t = makeController({
      fromAssertion: () =>
        Promise.reject(new UnauthorizedException('edge assertion rejected')),
    });

    const err = await t.controller
      .exchange(dto(), 'tampered.assertion.jws', t.res)
      .catch((e: unknown) => e);

    // 401-NEVER-421 at the delivery seam (AD-13): the thrown exception IS the
    // HTTP mapping, and it is 401. The engine's mint path has no 421 concept
    // to even reach — the edge-auth error union maps every rejection here.
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as HttpException).getStatus()).toBe(401);
    expect((err as HttpException).getStatus()).not.toBe(421);
    // Structured (never-white-screen): Nest serializes this response object,
    // so the consumer always gets a decodable {message, statusCode} body.
    expect((err as HttpException).getResponse()).toMatchObject({
      statusCode: 401,
      message: 'edge assertion rejected',
    });
    expect(t.setCookie).not.toHaveBeenCalled();
  });
});
