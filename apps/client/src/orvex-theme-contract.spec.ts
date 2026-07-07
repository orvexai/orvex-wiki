import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { mantineCssResolver, theme } from "@/theme";
import i18n from "@/i18n";

const HEX_RE = /^#[0-9a-f]{6}$/i;
// The resolver is invoked by MantineProvider with the fully resolved
// theme (defaults + overrides), never the raw createTheme() output.
const resolvedTheme = mergeMantineTheme(DEFAULT_THEME, theme);

// Named DoD binary gate (issue §5a). Crosses the theme structural contract
// and the i18n namespace contract through the exported modules only.
describe("TestOrvexThemeContract", () => {
  it("passes the full Orvex theme + i18n contract", () => {
    // (1) brand index-6 + primaryShade both schemes
    expect(theme.colors.brand[6]).toBe("#5658d6");
    expect(theme.primaryShade).toEqual({ light: 6, dark: 6 });

    // (2) five tuples are 10-stop #rrggbb
    for (const key of ["brand", "gray", "dark", "blue", "red"]) {
      const tuple = theme.colors[key];
      expect(tuple.length).toBe(10);
      expect(tuple.every((c: string) => HEX_RE.test(c))).toBe(true);
    }

    // (3) light/dark resolver token pins
    const { light, dark } = mantineCssResolver(resolvedTheme as any);
    expect(light["--mantine-color-body"]).toBe("#ffffff");
    expect(light["--mantine-color-text"]).toBe("#18181d");
    expect(light["--mantine-color-default-border"]).toBe("#ececef");
    expect(dark["--mantine-color-body"]).toBe("#16161c");
    expect(dark["--mantine-color-text"]).toBe("#f0f0f5");
    expect(dark["--mantine-color-default"]).toBe("#1e1e25");
    expect(dark["--mantine-color-default-border"]).toBe("#2d2d38");

    // (4) i18n orvex namespace + defaultNS + fallback
    expect(i18n.options.ns).toEqual(
      expect.arrayContaining(["translation", "orvex"]),
    );
    expect(i18n.options.defaultNS).toBe("translation");
    expect(i18n.options.fallbackLng).toEqual(
      expect.arrayContaining(["en-US"]),
    );
  });
});
