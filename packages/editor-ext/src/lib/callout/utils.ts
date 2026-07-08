export type CalloutType =
  | 'default'
  | 'info'
  | 'note'
  | 'success'
  | 'warning'
  | 'danger';
const validCalloutTypes = [
  'default',
  'info',
  'note',
  'success',
  'warning',
  'danger',
];

export function getValidCalloutType(value: string): string {
  if (value) {
    return validCalloutTypes.includes(value) ? value : 'info';
  }
}

/**
 * ENG-1377 (AC4) — the `attrs.role` value that marks a callout as the
 * page's role-anchored "tldr" lead block (`data-orvex-role="tldr"`).
 * Mirrors the server-side `TLDR_ROLE` constant in
 * `apps/server/src/orvex/page-blocks/dto/tldr.dto.ts`; kept as a
 * standalone client-bundle constant (rather than importing the server DTO)
 * to preserve the client/server tier boundary (CS §6).
 */
export const TLDR_ROLE = 'tldr' as const;
