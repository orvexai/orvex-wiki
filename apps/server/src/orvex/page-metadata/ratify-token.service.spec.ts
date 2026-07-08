// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createHmac } from 'crypto';
import { RatifyTokenService, decodePayload, encodePayload } from './ratify-token.service';
import { ConfirmTokenService } from './confirm-token.service';

/**
 * ENG-1445 — DoD binary gate: `RatifyConfirmTokenHmacSpec`.
 *
 * Real `crypto` throughout (❌#4 guard: never mock the owned HMAC adapter).
 * A fixed `APP_SECRET` + an injected clock (`now`) keep every assertion
 * deterministic (❌#9 guard: no wall-clock in the test body).
 */
describe('RatifyConfirmTokenHmacSpec', () => {
  const APP_SECRET = 'a'.repeat(40);
  const OTHER_SECRET = 'b'.repeat(40);
  const FIXED_NOW = 1_700_000_000_000;

  function makeRatifyService(secret: string): RatifyTokenService {
    return new RatifyTokenService({
      getAppSecret: () => secret,
    } as any);
  }

  function makeConfirmService(secret: string): ConfirmTokenService {
    return new ConfirmTokenService({
      getAppSecret: () => secret,
    } as any);
  }

  describe('(a) RatifyTokenService.issue()/verify() — HMAC mint + timing-safe verify', () => {
    it('AC1 — mints rt1.<payload>.<sig> whose HMAC reproduces byte-for-byte and whose payload decodes exactly', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token, expiresAt } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      expect(token.startsWith('rt1.')).toBe(true);
      const [prefix, payloadB64, sig] = token.split('.');
      expect(prefix).toBe('rt1');

      const expectedSig = createHmac('sha256', APP_SECRET)
        .update(`orvex.ratify.v1.${payloadB64}`)
        .digest('base64url');
      expect(sig).toBe(expectedSig);

      const payload = decodePayload<any>(payloadB64);
      expect(payload).toEqual({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        expiresAt: FIXED_NOW + RatifyTokenService.RATIFY_TOKEN_TTL_MS,
      });
      expect(expiresAt).toBe(FIXED_NOW + RatifyTokenService.RATIFY_TOKEN_TTL_MS);
    });

    it('AC2 — verify passes for the exact scope under the same secret', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      const result = service.verify(token, {
        expectPageId: 'page-1',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW + 1000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.pageId).toBe('page-1');
      }
    });

    it('AC2 — verify FAILS under a different secret', () => {
      const minter = makeRatifyService(APP_SECRET);
      const verifier = makeRatifyService(OTHER_SECRET);
      const { token } = minter.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      const result = verifier.verify(token, {
        expectPageId: 'page-1',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW,
      });

      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('AC2 — verify FAILS for a tampered payload', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });
      const [prefix, , sig] = token.split('.');

      const tamperedPayloadB64 = encodePayload({
        pageId: 'page-999-attacker-controlled',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        expiresAt: FIXED_NOW + RatifyTokenService.RATIFY_TOKEN_TTL_MS,
      });
      const tamperedToken = `${prefix}.${tamperedPayloadB64}.${sig}`;

      const result = service.verify(tamperedToken, {
        expectPageId: 'page-999-attacker-controlled',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW,
      });

      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('AC2 — verify FAILS for the wrong page scope, and for the wrong workspace scope', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-A',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      expect(
        service.verify(token, {
          expectPageId: 'page-B',
          expectWorkspaceId: 'ws-1',
          now: FIXED_NOW,
        }),
      ).toEqual({ ok: false, reason: 'invalid' });

      expect(
        service.verify(token, {
          expectPageId: 'page-A',
          expectWorkspaceId: 'ws-OTHER',
          now: FIXED_NOW,
        }),
      ).toEqual({ ok: false, reason: 'invalid' });
    });

    it('AC2 — buffers of unequal length never throw (a short/garbled signature is rejected, not thrown)', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });
      const [prefix, payloadB64] = token.split('.');
      const shortSigToken = `${prefix}.${payloadB64}.x`;

      expect(() =>
        service.verify(shortSigToken, {
          expectPageId: 'page-1',
          expectWorkspaceId: 'ws-1',
          now: FIXED_NOW,
        }),
      ).not.toThrow();

      expect(
        service.verify(shortSigToken, {
          expectPageId: 'page-1',
          expectWorkspaceId: 'ws-1',
          now: FIXED_NOW,
        }),
      ).toEqual({ ok: false, reason: 'invalid' });
    });

    it('AC3 — a token minted with a negative TTL is rejected as expired', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        ttlMs: -1,
        now: FIXED_NOW,
      });

      const result = service.verify(token, {
        expectPageId: 'page-1',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW,
      });

      expect(result).toEqual({ ok: false, reason: 'expired' });
    });

    it('AC3 — a token verified after the clock advances past the 30m default TTL is rejected as expired', () => {
      const service = makeRatifyService(APP_SECRET);
      const { token } = service.issue({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      const result = service.verify(token, {
        expectPageId: 'page-1',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW + RatifyTokenService.RATIFY_TOKEN_TTL_MS + 1,
      });

      expect(result).toEqual({ ok: false, reason: 'expired' });
    });
  });

  describe('(b) ConfirmTokenService.verify() — action-scoped rejection', () => {
    it('AC4 — a bulk_delete-minted token is rejected when presented for supersede, and vice versa', () => {
      const service = makeConfirmService(APP_SECRET);
      const { token: bulkDeleteToken } = service.issue({
        workspaceId: 'ws-1',
        action: 'bulk_delete',
        scopeId: 'batch-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      const wrongAction = service.verify(bulkDeleteToken, {
        expectWorkspaceId: 'ws-1',
        expectAction: 'supersede',
        expectScopeId: 'batch-1',
        now: FIXED_NOW,
      });
      expect(wrongAction).toEqual({ ok: false, reason: 'invalid' });

      const rightAction = service.verify(bulkDeleteToken, {
        expectWorkspaceId: 'ws-1',
        expectAction: 'bulk_delete',
        expectScopeId: 'batch-1',
        now: FIXED_NOW,
      });
      expect(rightAction.ok).toBe(true);
    });

    it('AC4 — the bulk-delete chokepoint accepts only a bulk_delete-scoped confirm token (a supersede token is refused)', () => {
      const service = makeConfirmService(APP_SECRET);
      const { token: supersedeToken } = service.issue({
        workspaceId: 'ws-1',
        action: 'supersede',
        scopeId: 'page-1',
        confirmingUserId: 'user-1',
        now: FIXED_NOW,
      });

      function bulkDeleteChokepoint(presentedToken: string): boolean {
        const result = service.verify(presentedToken, {
          expectWorkspaceId: 'ws-1',
          expectAction: 'bulk_delete',
          expectScopeId: 'batch-1',
          now: FIXED_NOW,
        });
        return result.ok;
      }

      expect(bulkDeleteChokepoint(supersedeToken)).toBe(false);
    });
  });

  describe('(c) agent-supplied / self-constructed tokens are rejected at every chokepoint', () => {
    it('rejects an unsigned ratify token an agent assembled by hand (no real HMAC)', () => {
      const service = makeRatifyService(APP_SECRET);
      const forgedPayloadB64 = encodePayload({
        pageId: 'page-1',
        workspaceId: 'ws-1',
        confirmingUserId: 'agent-self-mint',
        expiresAt: FIXED_NOW + RatifyTokenService.RATIFY_TOKEN_TTL_MS,
      });
      const forgedToken = `rt1.${forgedPayloadB64}.forged-signature`;

      const result = service.verify(forgedToken, {
        expectPageId: 'page-1',
        expectWorkspaceId: 'ws-1',
        now: FIXED_NOW,
      });

      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects an agent-forged confirm token even when it guesses the exact scope/action', () => {
      const service = makeConfirmService(APP_SECRET);
      const forgedPayloadB64 = encodePayload({
        workspaceId: 'ws-1',
        action: 'bulk_delete',
        scopeId: 'batch-1',
        confirmingUserId: 'agent-self-mint',
        expiresAt: FIXED_NOW + ConfirmTokenService.CONFIRM_TOKEN_TTL_MS,
      });
      const forgedToken = `ct1.${forgedPayloadB64}.also-not-a-real-hmac`;

      const result = service.verify(forgedToken, {
        expectWorkspaceId: 'ws-1',
        expectAction: 'bulk_delete',
        expectScopeId: 'batch-1',
        now: FIXED_NOW,
      });

      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects a completely malformed / non-token string without throwing', () => {
      const service = makeRatifyService(APP_SECRET);
      expect(() =>
        service.verify('not-a-token-at-all', {
          expectPageId: 'page-1',
          expectWorkspaceId: 'ws-1',
          now: FIXED_NOW,
        }),
      ).not.toThrow();
      expect(
        service.verify('not-a-token-at-all', {
          expectPageId: 'page-1',
          expectWorkspaceId: 'ws-1',
          now: FIXED_NOW,
        }),
      ).toEqual({ ok: false, reason: 'malformed' });
    });
  });

  describe('startup safety', () => {
    it('refuses to construct without a real (>=32 char) APP_SECRET', () => {
      expect(() => makeRatifyService('')).toThrow();
      expect(() => makeRatifyService('too-short')).toThrow();
      expect(() => makeConfirmService('')).toThrow();
    });
  });
});
