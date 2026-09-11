// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3350 — `HttpIdentityRegistryClient` must keep the promise its own class
 * doc makes: "A non-2xx / transport / parse failure is a thrown
 * RegistryClientError (honest failure) — NEVER a fabricated cell binding."
 *
 * It did not. `request()` called `res.json()` unconditionally, so a body that
 * was not JSON threw a raw `SyntaxError` — not a `RegistryClientError` — which
 * escaped every typed mapping in this file and reached NestJS as
 * `{"statusCode":500,"message":"Internal server error"}`.
 *
 * That was not hypothetical. Identity had no `/v1/registry/reserve` route at
 * all; Go's net/http answered its default `404 page not found` as text/plain;
 * `JSON.parse` read `404` as a number and threw on the `p` of `page`
 * ("Unexpected non-whitespace character after JSON at position 4"). The result
 * was that `POST /v1/exchange` returned 500 for EVERY fresh principal on the
 * dev cell — no new principal could onboard through any surface.
 *
 * These specs pin both halves of the fix: the parse is under this class's
 * control, and reserve calls the origin-locked route identity actually serves
 * with the shared engine seam bearer.
 */

import {
  HttpIdentityRegistryClient,
  RegistryClientError,
  RegistryFetchLike,
} from './identity-registry-client';

const TENANT = '912d4ae0-07ea-4c10-8015-61b3978110c0';
const TOKEN = 'shared-engine-seam-token';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** A fetch double that answers with a fixed status + RAW body string. */
function respondWith(
  status: number,
  raw: string,
  calls: RecordedCall[] = [],
): RegistryFetchLike {
  return (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    return Promise.resolve({ status, text: () => Promise.resolve(raw) });
  };
}

function newClient(
  fetchLike: RegistryFetchLike,
  internalToken: string | null = TOKEN,
) {
  return new HttpIdentityRegistryClient({
    baseUrl: 'http://identity.invalid',
    timeoutMs: 1000,
    internalToken,
    fetch: fetchLike,
  });
}

async function captureError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection, got a resolved value');
}

describe('HttpIdentityRegistryClient — non-JSON responses (the ENG-3350 defect)', () => {
  // The EXACT body Go's net/http writes for an unrouted path. This is the
  // literal production input; a stylized "not json" string would not prove the
  // interesting part (that `404` parses as a valid JSON number first).
  const GO_DEFAULT_404 = '404 page not found\n';

  it('reserveTenant turns a text/plain 404 into a typed DEPENDENCY_ERROR, not a raw SyntaxError', async () => {
    const client = newClient(respondWith(404, GO_DEFAULT_404));

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect(err).toBeInstanceOf(RegistryClientError);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    // The message must name the status AND show the body, or an operator is
    // back to reading pod logs to find out what answered.
    expect((err as RegistryClientError).message).toContain('404');
    expect((err as RegistryClientError).message).toContain(
      '404 page not found',
    );
  });

  it('the same protection covers resolveTenantCell and moveTenantCell (one request path, one promise)', async () => {
    const client = newClient(respondWith(502, '<html>bad gateway</html>'));

    for (const call of [
      () => client.resolveTenantCell(TENANT),
      () =>
        client.moveTenantCell({
          moveId: 'm1',
          tenantId: TENANT,
          fromCell: 'eu1a',
          toCell: 'us1a',
        }),
    ]) {
      const err = await captureError(call());
      expect(err).toBeInstanceOf(RegistryClientError);
      expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    }
  });

  it('bounds the body it quotes, so a large/HTML error page cannot flood the log line', async () => {
    const client = newClient(respondWith(500, 'x'.repeat(5000)));

    const err = (await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    )) as RegistryClientError;

    expect(err.message.length).toBeLessThan(400);
    expect(err.message).toContain('…');
  });

  it('a transport failure is typed too — never an untyped throw crossing the seam', async () => {
    const client = newClient(() => Promise.reject(new Error('ECONNREFUSED')));

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect(err).toBeInstanceOf(RegistryClientError);
    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    expect((err as RegistryClientError).message).toContain('ECONNREFUSED');
  });

  it('an EMPTY body on a typed refusal still maps to that refusal, not to a parse error', async () => {
    // 409 with no body is a legitimate refusal shape; the per-status branches
    // never read the payload, so an empty body must not be downgraded into a
    // generic DEPENDENCY_ERROR that loses which refusal happened.
    const client = newClient(respondWith(409, ''));

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect((err as RegistryClientError).code).toBe('TENANT_ALREADY_RESERVED');
  });

  it('an EMPTY or null body on a SUCCESS status is a typed refusal, not a TypeError', async () => {
    // The mirror image of the case above, and the one the empty-body rule
    // opened: `raw.trim() === '' -> payload: null` is right for the 404/409
    // branches (they never read the payload) but the 200 branches DO, and
    // `payload as Record<string, unknown>` on `null` throws a raw TypeError.
    // That is the same escape as the original SyntaxError — an untyped throw
    // crossing this seam, which NestJS renders as an opaque 500 — so it is
    // asserted on every 200-reading method, for both spellings of "no body".
    for (const raw of ['', '   ', 'null']) {
      const reserve = await captureError(
        newClient(respondWith(200, raw)).reserveTenant({
          tenantId: TENANT,
          hostname: '',
          principalKind: 'user',
        }),
      );
      expect(reserve).toBeInstanceOf(RegistryClientError);
      expect((reserve as RegistryClientError).code).toBe('DEPENDENCY_ERROR');

      const move = await captureError(
        newClient(respondWith(200, raw)).moveTenantCell({
          moveId: 'm1',
          tenantId: TENANT,
          fromCell: 'eu1a',
          toCell: 'eu1b',
        }),
      );
      expect(move).toBeInstanceOf(RegistryClientError);
      expect((move as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    }
  });
});

describe('HttpIdentityRegistryClient — the reserve seam (ENG-3350)', () => {
  it('calls the ORIGIN-LOCKED /internal route carrying the shared engine bearer', async () => {
    const calls: RecordedCall[] = [];
    const client = newClient(
      respondWith(
        200,
        JSON.stringify({ tenantId: TENANT, reserved: true }),
        calls,
      ),
    );

    const result = await client.reserveTenant({
      tenantId: TENANT,
      hostname: '',
      principalKind: 'user',
    });

    expect(result).toEqual({
      tenantId: TENANT,
      reserved: true,
      orgId: undefined,
    });
    expect(calls).toHaveLength(1);
    // NOT /v1/registry/reserve: that path has never existed on identity, and
    // the /v1/registry/* writes are machine-only (they need an identity-minted
    // "svc:" grant this engine holds in no cell).
    expect(calls[0].url).toBe(
      'http://identity.invalid/internal/registry/reserve',
    );
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('refuses to call at all when the shared seam credential is unset (fail closed)', async () => {
    const calls: RecordedCall[] = [];
    const client = newClient(
      respondWith(
        200,
        JSON.stringify({ tenantId: TENANT, reserved: true }),
        calls,
      ),
      null,
    );

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    expect((err as RegistryClientError).message).toContain(
      'INTERNAL_API_BEARER_TOKEN',
    );
    // It must not have gone out unauthenticated "just in case".
    expect(calls).toHaveLength(0);
  });

  it('a 200 that does not actually reserve is still a failure, never a fabricated reservation', async () => {
    const client = newClient(
      respondWith(200, JSON.stringify({ tenantId: TENANT, reserved: false })),
    );

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
  });

  it('maps identity 404 to NOT_FOUND and 409 to TENANT_ALREADY_RESERVED', async () => {
    const notFound = await captureError(
      newClient(
        respondWith(404, JSON.stringify({ error: 'not_found' })),
      ).reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );
    expect((notFound as RegistryClientError).code).toBe('NOT_FOUND');

    const conflict = await captureError(
      newClient(
        respondWith(409, JSON.stringify({ error: 'tenant_already_reserved' })),
      ).reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );
    expect((conflict as RegistryClientError).code).toBe(
      'TENANT_ALREADY_RESERVED',
    );
  });

  it('a 401 from the engine seam gate is AUTH_FAILED, not a generic dependency blip (ENG-3313)', async () => {
    const client = newClient(
      respondWith(401, JSON.stringify({ error: 'unauthorized' })),
    );

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: '',
        principalKind: 'user',
      }),
    );

    expect((err as RegistryClientError).code).toBe('AUTH_FAILED');
    expect((err as RegistryClientError).code).not.toBe('DEPENDENCY_ERROR');
  });

  it("identity's 501 for the unimplemented hostname leg is loud and typed, never a silent success", async () => {
    const client = newClient(
      respondWith(
        501,
        JSON.stringify({ error: 'hostname_reservation_unimplemented' }),
      ),
    );

    const err = await captureError(
      client.reserveTenant({
        tenantId: TENANT,
        hostname: 'acme.example.invalid',
        principalKind: 'org',
      }),
    );

    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    expect((err as RegistryClientError).message).toContain('501');
  });
});

/**
 * ENG-3313 — the move seam, the sibling of the reserve block above and broken
 * the same way: `moveTenantCell` POSTed `/v1/registry/move` with NO
 * Authorization header at all. ENG-2013 made that route machine-only, so
 * identity denied it with a uniform 401 that arrived here as an untyped
 * dependency failure and left as a 502 naming nothing about authn.
 *
 * These specs pin the same three properties ENG-3350 pinned for reserve — the
 * origin-locked route, the bearer, and the fail-closed refusal — plus the
 * typed 401, and one that guards the DELIBERATE asymmetry: the discovery read
 * must stay unauthenticated.
 */
describe('HttpIdentityRegistryClient — the move seam (ENG-3313)', () => {
  const MOVE = {
    moveId: 'm-3313',
    tenantId: TENANT,
    fromCell: 'eu1a',
    toCell: 'us1a',
  };

  it('calls the ORIGIN-LOCKED /internal route carrying the shared engine bearer', async () => {
    const calls: RecordedCall[] = [];
    const client = newClient(
      respondWith(
        200,
        JSON.stringify({ tenantId: TENANT, cellId: 'us1a' }),
        calls,
      ),
    );

    const result = await client.moveTenantCell(MOVE);

    expect(result).toEqual({ tenantId: TENANT, cellId: 'us1a' });
    expect(calls).toHaveLength(1);
    // NOT /v1/registry/move: that route is machine-only (requireMachinePrincipal
    // needs an identity-minted "svc:" grant this engine holds in no cell, and
    // prod registers no machine client at all), so a move posted there 401s
    // forever. Identity's ENG-3427 counterparty admits the shared engine bearer.
    expect(calls[0].url).toBe('http://identity.invalid/internal/registry/move');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('keeps the request body byte-identical to identity registryMoveRequest json tags', async () => {
    // The internal route delegates to the SAME doRegistryMove core as the
    // machine-gated one, so re-pointing the path must not have re-shaped the
    // body — that is what makes the 200/404/409 mapping still correct.
    const calls: RecordedCall[] = [];
    await newClient(
      respondWith(
        200,
        JSON.stringify({ tenantId: TENANT, cellId: 'us1a' }),
        calls,
      ),
    ).moveTenantCell(MOVE);

    expect(JSON.parse(calls[0].body as string)).toEqual({
      moveId: 'm-3313',
      tenantId: TENANT,
      fromCell: 'eu1a',
      toCell: 'us1a',
    });
  });

  it('refuses to call at all when the shared seam credential is unset (fail closed)', async () => {
    const calls: RecordedCall[] = [];
    const client = newClient(
      respondWith(
        200,
        JSON.stringify({ tenantId: TENANT, cellId: 'us1a' }),
        calls,
      ),
      null,
    );

    const err = await captureError(client.moveTenantCell(MOVE));

    expect((err as RegistryClientError).code).toBe('DEPENDENCY_ERROR');
    expect((err as RegistryClientError).message).toContain(
      'INTERNAL_API_BEARER_TOKEN',
    );
    // It must not have gone out unauthenticated "just in case".
    expect(calls).toHaveLength(0);
  });

  it('maps a 401 to AUTH_FAILED, never to the generic DEPENDENCY_ERROR', async () => {
    // identity's requireEngineInternal answers exactly this body, with no
    // oracle distinguishing "wrong token" from "none configured".
    const err = await captureError(
      newClient(
        respondWith(401, JSON.stringify({ error: 'unauthorized' })),
      ).moveTenantCell(MOVE),
    );

    expect((err as RegistryClientError).code).toBe('AUTH_FAILED');
    expect((err as RegistryClientError).code).not.toBe('DEPENDENCY_ERROR');
  });

  it('still maps 404 to NOT_FOUND and 409 to STALE_MOVE across the new route', async () => {
    const notFound = await captureError(
      newClient(respondWith(404, '')).moveTenantCell(MOVE),
    );
    expect((notFound as RegistryClientError).code).toBe('NOT_FOUND');

    const stale = await captureError(
      newClient(respondWith(409, '')).moveTenantCell(MOVE),
    );
    expect((stale as RegistryClientError).code).toBe('STALE_MOVE');
  });

  it('leaves the DISCOVERY READ unauthenticated — the deliberately-open route', async () => {
    // Guards an ASSERTED scope boundary, not an oversight: identity pins it
    // with TestRegistryResolve_StaysOpen. If a header ever appears here it
    // must be a deliberate decision that deletes this spec, not a drive-by
    // "harden everything" edit riding along with the write-path fix.
    const calls: RecordedCall[] = [];
    await newClient(
      respondWith(
        200,
        JSON.stringify({
          tenant_id: TENANT,
          cell_id: 'eu1a',
          residency_pin: 'eu',
          cell_epoch: 3,
          status: 'active',
        }),
        calls,
      ),
    ).resolveTenantCell(TENANT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `http://identity.invalid/v1/registry/tenants/${TENANT}/cell`,
    );
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});
