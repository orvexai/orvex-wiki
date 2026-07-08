/**
 * ENG-1371 — lifecycle status enum for the `orvex_page_meta` side table.
 * Ported (verbatim values) from the fork's `orvex-extensions` package.
 */
export enum PageStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CANONICAL = 'canonical',
  DEPRECATED = 'deprecated',
  SUPERSEDED = 'superseded',
  ARCHIVED = 'archived',
}

export const PAGE_METADATA_SERVICE = Symbol('ORVEX_PAGE_METADATA_SERVICE');

/**
 * Recognised metadata fields the side table carries (AC1, ruling 4).
 *
 * PD-4d carve-out (2026-07-08): the ENG-1447 provenance trio
 * (`provenanceStatus`/`provenanceChangedAt`/`provenanceChangedById`) is
 * deliberately NOT included here — it stays on `pages` (ENG-1447, merged)
 * for now and is migrated into `orvex_page_meta` by follow-up ENG-1603.
 */
export interface OrvexPageMetaFields {
  status: PageStatus;
  docType: string | null;
  ownerId: string | null;
  lastReviewedAt: Date | null;
  supersedes: unknown | null;
  supersededBy: string | null;
  redirectFrom: string | null;
  unknownFrontmatter: Record<string, unknown> | null;
  verifiedAgainst: string | null;
  verifiedAt: Date | null;
  specConfirmed: boolean;
  archiveReason: string | null;
  version: number;
  contentHash: string | null;
}

/** Sane defaults for a page with no `orvex_page_meta` row (AC3). */
export const DEFAULT_PAGE_META: OrvexPageMetaFields = {
  status: PageStatus.DRAFT,
  docType: null,
  ownerId: null,
  lastReviewedAt: null,
  supersedes: null,
  supersededBy: null,
  redirectFrom: null,
  unknownFrontmatter: null,
  verifiedAgainst: null,
  verifiedAt: null,
  specConfirmed: false,
  archiveReason: null,
  version: 1,
  contentHash: null,
};

/** Partial patch accepted by `OrvexPageMetadataService.applyMetadata`. */
export type OrvexPageMetadataDto = Partial<
  Omit<OrvexPageMetaFields, 'version'>
> & {
  version?: number;
};
