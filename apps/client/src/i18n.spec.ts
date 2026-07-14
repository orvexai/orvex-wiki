import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

describe("i18n", () => {
  // AC7
  it("registers the orvex namespace alongside translation, with translation as default", () => {
    expect(i18n.options.ns).toEqual(
      expect.arrayContaining(["translation", "orvex"]),
    );
    expect(i18n.options.defaultNS).toBe("translation");
  });

  // AC8
  it("configures fallback language, currentOnly load, and react-safe escaping", () => {
    expect(i18n.options.fallbackLng).toEqual(
      expect.arrayContaining(["en-US"]),
    );
    expect(i18n.options.load).toBe("currentOnly");
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });

  // AC10
  it("never white-screens on a missing key: react.useSuspense is disabled", () => {
    expect(i18n.options.react?.useSuspense).toBe(false);
  });
});
