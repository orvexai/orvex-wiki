import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * ENG-1413 — the pure domain guard for the `ifVersion` CAS precondition.
 *
 * Two supported shapes:
 *  - an INTEGER version (the new atomic primitive, AC1) — compared against
 *    the `orvex_page_meta.version` side-table column;
 *  - a legacy ISO-8601 timestamp (AC2, backward compat) — compared by
 *    instant against `pages.updatedAt`.
 *
 * This module performs NO I/O and makes NO atomicity guarantee by itself —
 * it is a deterministic verdict function. The race-proof guarantee for the
 * integer path is the atomic `UPDATE … WHERE version = ?` folded into the
 * store tier (see `PageRepo.casIncrementMeta`); this util's integer branch
 * is a fast pre-check that lets a stale caller fail BEFORE the idempotency
 * claim is consumed (AC5) — the store-tier UPDATE re-verifies atomically so
 * there is no read-then-write TOCTOU on the actual write decision.
 */

export function isIntegerVersion(value: unknown): value is number | string {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return /^\d+$/.test(value.trim());
  }
  return false;
}

export function toIntegerVersion(value: number | string): number {
  return typeof value === 'number' ? value : parseInt(value, 10);
}

function isParsableIsoInstant(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export interface VersionMismatchPayload {
  code: 'VERSION_MISMATCH';
  serverVersion: number | string;
}

export interface InvalidIfVersionPayload {
  code: 'INVALID_IF_VERSION';
}

/**
 * Asserts an `ifVersion` precondition. Throws `ConflictException` (409,
 * `VERSION_MISMATCH`) on drift, `BadRequestException` (400,
 * `INVALID_IF_VERSION`) when the value is neither a valid integer nor a
 * parsable ISO-8601 instant. A no-op when `ifVersion` is undefined/null.
 *
 * `currentVersion` is the side-table integer version (may be omitted if
 * unknown yet — the integer branch then defers to the store-tier atomic
 * check alone).
 */
export function assertIfVersionMatches(
  updatedAt: Date,
  ifVersion: number | string | undefined | null,
  currentVersion?: number,
): void {
  if (ifVersion === undefined || ifVersion === null) {
    return;
  }

  if (isIntegerVersion(ifVersion)) {
    if (currentVersion === undefined) {
      return;
    }
    const supplied = toIntegerVersion(ifVersion);
    if (supplied !== currentVersion) {
      throw new ConflictException({
        code: 'VERSION_MISMATCH',
        serverVersion: currentVersion,
      } satisfies VersionMismatchPayload);
    }
    return;
  }

  if (typeof ifVersion === 'string' && isParsableIsoInstant(ifVersion)) {
    const suppliedInstant = Date.parse(ifVersion);
    const actualInstant = updatedAt.getTime();
    if (suppliedInstant !== actualInstant) {
      throw new ConflictException({
        code: 'VERSION_MISMATCH',
        serverVersion: updatedAt.toISOString(),
      } satisfies VersionMismatchPayload);
    }
    return;
  }

  throw new BadRequestException({
    code: 'INVALID_IF_VERSION',
  } satisfies InvalidIfVersionPayload);
}
