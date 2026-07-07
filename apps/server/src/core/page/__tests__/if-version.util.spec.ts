import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertIfVersionMatches,
  isIntegerVersion,
  toIntegerVersion,
} from '../if-version.util';

describe('if-version.util', () => {
  describe('isIntegerVersion', () => {
    it('accepts positive integers', () => {
      expect(isIntegerVersion(1)).toBe(true);
      expect(isIntegerVersion(42)).toBe(true);
      expect(isIntegerVersion('7')).toBe(true);
    });

    it('rejects zero, negatives, floats, and non-numeric strings', () => {
      expect(isIntegerVersion(0)).toBe(false);
      expect(isIntegerVersion(-1)).toBe(false);
      expect(isIntegerVersion(1.5)).toBe(false);
      expect(isIntegerVersion('abc')).toBe(false);
      expect(isIntegerVersion('2026-07-07T00:00:00.000Z')).toBe(false);
      expect(isIntegerVersion('')).toBe(false);
      expect(isIntegerVersion(undefined)).toBe(false);
    });
  });

  describe('toIntegerVersion', () => {
    it('parses both number and numeric-string forms', () => {
      expect(toIntegerVersion(3)).toBe(3);
      expect(toIntegerVersion('3')).toBe(3);
    });
  });

  describe('assertIfVersionMatches — integer CAS (AC1)', () => {
    const updatedAt = new Date('2026-07-01T00:00:00.000Z');

    it('is a no-op when ifVersion is undefined/null', () => {
      expect(() =>
        assertIfVersionMatches(updatedAt, undefined, 5),
      ).not.toThrow();
      expect(() => assertIfVersionMatches(updatedAt, null, 5)).not.toThrow();
    });

    it('passes when the integer ifVersion matches the current version', () => {
      expect(() => assertIfVersionMatches(updatedAt, 5, 5)).not.toThrow();
    });

    it('409s with VERSION_MISMATCH when the integer ifVersion has drifted', () => {
      try {
        assertIfVersionMatches(updatedAt, 4, 5);
        fail('expected ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse();
        expect(response).toMatchObject({
          code: 'VERSION_MISMATCH',
          serverVersion: 5,
        });
      }
    });

    it('defers to the store-tier atomic check when currentVersion is unknown', () => {
      expect(() =>
        assertIfVersionMatches(updatedAt, 4, undefined),
      ).not.toThrow();
    });
  });

  describe('assertIfVersionMatches — legacy ISO-8601 CAS (AC2)', () => {
    it('passes when the timestamp matches by instant', () => {
      const updatedAt = new Date('2026-07-01T12:00:00.000Z');
      expect(() =>
        assertIfVersionMatches(updatedAt, '2026-07-01T12:00:00.000Z'),
      ).not.toThrow();
    });

    it('409s with VERSION_MISMATCH on a stale timestamp', () => {
      const updatedAt = new Date('2026-07-01T12:00:00.000Z');
      try {
        assertIfVersionMatches(updatedAt, '2026-07-01T00:00:00.000Z');
        fail('expected ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
          code: 'VERSION_MISMATCH',
        });
      }
    });

    it('400s with INVALID_IF_VERSION on an unparseable, non-integer value', () => {
      const updatedAt = new Date('2026-07-01T12:00:00.000Z');
      try {
        assertIfVersionMatches(updatedAt, 'not-a-version');
        fail('expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_IF_VERSION',
        });
      }
    });
  });
});
