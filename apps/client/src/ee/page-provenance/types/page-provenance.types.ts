/**
 * ENG-1460 — client-side provenance status type.
 *
 * This is a pure PROJECTION of the engine's `ProvenanceStatus` union
 * (`apps/server/src/core/page-provenance/orvex-page-provenance.service.ts`,
 * ENG-1447). The client never computes or infers this value — it only
 * renders what the engine returns.
 */
export type ProvenanceStatus =
  | "ai_produced"
  | "ai_edited"
  | "human_verified"
  | null;
