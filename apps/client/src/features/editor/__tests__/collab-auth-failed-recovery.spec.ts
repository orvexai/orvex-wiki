import { describe, it, expect, vi } from "vitest";
import { jwtDecode } from "jwt-decode";

/**
 * Regression for the uncaught `pageerror: Invalid token specified: must be a
 * string` observed in the live browser E2E run (apps/client/e2e/
 * real-user-journey.spec.ts).
 *
 * `page-editor.tsx`'s `onAuthenticationFailedHandler` decoded
 * `collabQuery?.token` directly. That value is optional-chained everywhere
 * else in the hook because the collab-token query can legitimately have no
 * data: still in flight, or failed (a 429 from AUTH_THROTTLER, an offline
 * blip). Handing `undefined` to `jwtDecode` throws — and because the throw
 * happened inside a Hocuspocus event handler it surfaced as an UNCAUGHT
 * pageerror, killing the handler before it could do the one thing it exists
 * for: refetch the token and reconnect.
 *
 * The contract this pins: a token that cannot be decoded must be treated as
 * EXPIRED (so the caller refetches), never allowed to throw.
 */

/** The decision the handler makes, extracted verbatim from page-editor.tsx. */
function isTokenExpired(token: string | undefined, nowSeconds: number): boolean {
  let expired = true;
  try {
    const payload = jwtDecode(token ?? "");
    expired = !payload.exp || nowSeconds >= payload.exp;
  } catch {
    // No decodable token — treat as expired so the caller refetches.
  }
  return expired;
}

/** Minimal unsigned JWT with the given exp (decode never verifies). */
function tokenWithExp(exp: number): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ exp })}.`;
}

describe("collab onAuthenticationFailed token handling", () => {
  it("does not throw when the token is undefined (the observed pageerror)", () => {
    expect(() => isTokenExpired(undefined, 1_000)).not.toThrow();
  });

  it("treats an undefined token as expired so the handler refetches", () => {
    expect(isTokenExpired(undefined, 1_000)).toBe(true);
  });

  it("treats a malformed token as expired rather than throwing", () => {
    expect(() => isTokenExpired("not-a-jwt", 1_000)).not.toThrow();
    expect(isTokenExpired("not-a-jwt", 1_000)).toBe(true);
  });

  it("still reports a genuinely expired token as expired", () => {
    expect(isTokenExpired(tokenWithExp(500), 1_000)).toBe(true);
  });

  it("does NOT refetch on a still-valid token (no reconnect storm)", () => {
    expect(isTokenExpired(tokenWithExp(9_000), 1_000)).toBe(false);
  });

  it("proves the OLD code threw on undefined — the defect this pins", () => {
    // The pre-fix expression, verbatim: jwtDecode(collabQuery?.token)
    expect(() => jwtDecode(undefined as unknown as string)).toThrow(
      /must be a string/i,
    );
  });
});
