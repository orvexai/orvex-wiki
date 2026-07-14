import { describe, expect, it } from "vitest";
import {
  getStatusColor,
  getStatusLabel,
} from "@/ee/page-verification/components/verification-status";

/**
 * ENG-1459 (AC4/DoD part d) — the editor-header badge is a pure projection
 * of `page_verifications.status`; this locks that every status maps to a
 * visual, and — CS §11 honesty — that "expired"/"obsolete" never render
 * with the same color as "verified", so the badge can never read as
 * verified for a page that isn't.
 */
describe("page-verification status projection", () => {
  const identity = (key: string) => key;

  it("maps every VerificationStatus to a non-empty label (except 'none')", () => {
    const statuses = [
      "verified",
      "expiring",
      "expired",
      "draft",
      "in_approval",
      "approved",
      "obsolete",
    ] as const;

    for (const status of statuses) {
      expect(getStatusLabel(status, identity)).not.toBe("");
    }
  });

  it("'none' has no label (badge renders the set-up affordance instead)", () => {
    expect(getStatusLabel("none", identity)).toBe("");
  });

  it("never colors 'expired' or 'obsolete' the same as 'verified'", () => {
    const verifiedColor = getStatusColor("verified");
    expect(getStatusColor("expired")).not.toBe(verifiedColor);
    expect(getStatusColor("obsolete")).not.toBe(verifiedColor);
  });

  it("'verified' and 'approved' share the affirmative color", () => {
    expect(getStatusColor("verified")).toBe(getStatusColor("approved"));
  });
});
