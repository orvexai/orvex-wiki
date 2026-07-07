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

/** Recognised metadata fields the side table carries (AC1, ruling 4). */
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
  provenanceStatus: string | null;
  provenanceChangedAt: Date | null;
  provenanceChangedById: string | null;
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
  provenanceStatus: null,
  provenanceChangedAt: null,
  provenanceChangedById: null,
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
