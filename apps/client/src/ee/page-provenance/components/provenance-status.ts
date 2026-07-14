import { ProvenanceStatus } from "@/ee/page-provenance/types/page-provenance.types";

/**
 * ENG-1460 AC3 — engine status -> badge label.
 *
 * An unrecognized/unknown status (including `null`) maps to an empty
 * label, which `PageProvenanceBadge` treats as "render no badge" — this
 * function must never throw on an unexpected input (AC5 no-white-screen).
 */
export function getProvenanceLabel(
  status: ProvenanceStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "ai_produced":
      return t("AI Produced");
    case "ai_edited":
      return t("AI Edited");
    case "human_verified":
      return t("Verified");
    default:
      return "";
  }
}

/**
 * ENG-1460 AC4 — the provenance badge is visually distinct from the QMS
 * verify badge (`@/ee/page-verification`): its own color scale, never
 * shared with `getStatusColor` in `page-verification/components/verification-status.ts`.
 */
export function getProvenanceColor(status: ProvenanceStatus): string {
  switch (status) {
    case "human_verified":
      return "teal.7";
    case "ai_produced":
    case "ai_edited":
      return "violet.6";
    default:
      return "gray.6";
  }
}
