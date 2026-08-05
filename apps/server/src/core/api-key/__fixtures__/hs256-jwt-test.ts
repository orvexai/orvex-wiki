// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * TEST-ONLY HS256 compact-JWT sign/verify — used by
 * `api-key.contract.spec.ts` to mint and inspect the SAME `APP_SECRET`
 * bearer tokens `@nestjs/jwt`'s `JwtModule.register({secret})` (the real
 * production auth path under test) signs. Hand-rolled on `node:crypto`'s
 * HMAC primitives rather than the `jsonwebtoken` package: AD-9's
 * `jose_jwt` substrate-allow list names ONLY `pkg/auth` (Go) and its TS
 * peer `@orvexai/auth-node` as sanctioned JWT/JOSE-library importers, with
 * no test-file exemption (`orvex-studio-contracts`
 * `gates/eslint/restrictions.yaml` — this restriction, unlike the
 * neighbouring `process-env` ban, carries no `test_exempt_ref`).
 */

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/** Signs `claims` as a compact HS256 JWT with `secret`. */
export function signHs256Jwt(claims: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64Url(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadB64 = base64Url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  return `${headerB64}.${payloadB64}.${base64Url(signature)}`;
}

/** Verifies a compact HS256 JWT's signature against `secret` and returns its claims. */
export function verifyHs256Jwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('verifyHs256Jwt: not a 3-part compact JWT');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const expectedSig = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actualSig = Buffer.from(signatureB64, 'base64url');
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new Error('verifyHs256Jwt: signature mismatch');
  }
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
