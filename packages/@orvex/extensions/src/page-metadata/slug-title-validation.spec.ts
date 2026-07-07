import { describe, expect, it } from 'vitest';
import {
  validateSlugTitle,
  normalizeForSlugCheck,
  BANNED_SLUG_SUFFIX_REGEX,
  DATE_SLUG_REGEX,
  DATED_DOC_TYPES,
} from './slug-title-validation';

describe('validateSlugTitle — banned suffixes (CONTRACTS §0.6)', () => {
  const banned = [
    'Auth Design v2',
    'auth-design-v3',
    'auth-design-v9',
    'Pricing final',
    'pricing-final',
    'notes new',
    'spec-wip',
    'design-revised',
    'plan-copy',
    'guide-updated',
    'draft-draft',
    'config-old',
    'foo-2',
    'foo-9',
    'foo_v2',
    'foo_final',
  ];

  it.each(banned)('rejects "%s" regardless of doc_type', (value) => {
    const v = validateSlugTitle(value, 'architecture');
    expect(v?.error).toBe('BANNED_SLUG_SUFFIX');
  });

  it('does not reject a clean title', () => {
    expect(validateSlugTitle('Authentication Design', 'architecture')).toBeNull();
    expect(validateSlugTitle('version-control-guide', 'how-to')).toBeNull();
  });

  it('does not over-match "v1" or numbers mid-token', () => {
    expect(validateSlugTitle('api-v1', 'api-reference')).toBeNull();
    expect(validateSlugTitle('q2-planning-overview', 'project-overview')).toBeNull();
  });
});

describe('validateSlugTitle — phase-keyed PRD exemption (per PO ruling 2026-07-03)', () => {
  it('allows a trailing -phase-N ONLY for doc_type: prd', () => {
    expect(
      validateSlugTitle('PRD Orvex AI Studio Phase 2', 'prd'),
    ).toBeNull();
    expect(validateSlugTitle('prd-orvex-ai-studio-phase-9', 'prd')).toBeNull();
  });

  it('still rejects -phase-N for any other doc_type', () => {
    expect(
      validateSlugTitle('PRD Orvex AI Studio Phase 2', 'architecture')?.error,
    ).toBe('BANNED_SLUG_SUFFIX');
  });

  it('does not exempt a bare trailing digit that is not phase-keyed', () => {
    expect(validateSlugTitle('auth-design-2', 'prd')?.error).toBe(
      'BANNED_SLUG_SUFFIX',
    );
  });

  it('still rejects other banned suffixes for doc_type: prd', () => {
    expect(validateSlugTitle('prd-final', 'prd')?.error).toBe(
      'BANNED_SLUG_SUFFIX',
    );
  });
});

describe('validateSlugTitle — date segments key on doc_type (CONTRACTS §0.6, §2.9)', () => {
  const dated = ['Release 2026-05', 'changelog-2026', 'retro-2026-05-29', 'plan-2026q2'];

  it.each(dated)('rejects "%s" for a non-dated doc_type', (value) => {
    const v = validateSlugTitle(value, 'architecture');
    expect(v?.error).toBe('DATE_SLUG_NOT_ALLOWED');
  });

  it('allows a date segment ONLY for the closed dated allow-list', () => {
    expect(validateSlugTitle('Release 2026-05', 'release-notes')).toBeNull();
    expect(validateSlugTitle('retro-2026-05-29', 'retro')).toBeNull();
    expect(validateSlugTitle('retro-2026-05-29', 'retrospective')).toBeNull();
    expect(validateSlugTitle('decision-2026q2', 'adr')).toBeNull();
  });

  it('rejects a date segment when doc_type is undefined', () => {
    expect(validateSlugTitle('weekly-2026-05', undefined)?.error).toBe(
      'DATE_SLUG_NOT_ALLOWED',
    );
  });

  describe('ENG-1348 — bare 4-digit runs that are NOT years', () => {
    const realDates = [
      'release-notes-2026',
      'foo-2026-07-05',
      'plan-2026q1',
      'x-1999-report',
    ];

    it.each(realDates)(
      'still rejects "%s" for a non-dated doc_type (real date)',
      (value) => {
        const v = validateSlugTitle(value, 'architecture');
        expect(v?.error).toBe('DATE_SLUG_NOT_ALLOWED');
      },
    );

    const notDates = [
      'ENG-1327 verify',
      'ENG-1328 roundtrip',
      'ENG-1344 render',
      'service-port-8080',
      'id-1234-thing',
    ];

    it.each(notDates)(
      'no longer rejects "%s" as a date slug for a non-dated doc_type',
      (value) => {
        expect(validateSlugTitle(value, 'architecture')?.error).not.toBe(
          'DATE_SLUG_NOT_ALLOWED',
        );
      },
    );
  });
});

describe('validateSlugTitle — edge cases', () => {
  it('returns null for empty / nullish input', () => {
    expect(validateSlugTitle('', 'architecture')).toBeNull();
    expect(validateSlugTitle(null, 'architecture')).toBeNull();
    expect(validateSlugTitle(undefined, 'architecture')).toBeNull();
  });

  it('banned-suffix takes precedence over a date segment', () => {
    // "-copy" is banned; even with a date present, the suffix wins.
    expect(validateSlugTitle('report-2026-copy', 'release-notes')?.error).toBe(
      'BANNED_SLUG_SUFFIX',
    );
  });
});

describe('frozen constants', () => {
  it('DATED_DOC_TYPES is the closed set', () => {
    expect([...DATED_DOC_TYPES].sort()).toEqual(
      ['adr', 'release-notes', 'retro', 'retrospective', 'wiki-answer'].sort(),
    );
  });

  it('regexes are case-insensitive', () => {
    expect(BANNED_SLUG_SUFFIX_REGEX.test('design-FINAL')).toBe(true);
    expect(DATE_SLUG_REGEX.test('rel-2026Q3')).toBe(true);
  });

  it('normalizeForSlugCheck folds whitespace/slashes to single hyphens', () => {
    expect(normalizeForSlugCheck('  Auth   Design / v2 ')).toBe('auth-design-v2');
  });
});
