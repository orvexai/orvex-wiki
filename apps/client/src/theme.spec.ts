import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { mantineCssResolver, theme } from "@/theme";

const HEX_RE = /^#[0-9a-f]{6}$/i;
// The resolver is invoked by MantineProvider with the fully resolved
// theme (defaults + overrides), never the raw createTheme() output.
const resolvedTheme = mergeMantineTheme(DEFAULT_THEME, theme);

describe("theme", () => {
  // AC1
  it("sets brand as the primary color with index-6 Orvex indigo #5658d6", () => {
    expect(theme.primaryColor).toBe("brand");
    expect(theme.colors.brand[6]).toBe("#5658d6");
  });

  // AC2
  it("keeps the brand shade at index 6 in both light and dark schemes", () => {
    expect(theme.primaryShade).toEqual({ light: 6, dark: 6 });
  });

  // AC3
  it("has complete 10-stop hex scales for brand, gray, dark, blue, red", () => {
    const required = ["brand", "gray", "dark", "blue", "red"];
    for (const key of required) {
      const tuple = theme.colors[key];
      expect(tuple, `theme.colors.${key} missing`).toBeDefined();
      expect(tuple.length).toBe(10);
      expect(tuple.every((c: string) => HEX_RE.test(c))).toBe(true);
    }
  });

  // AC6
  it("carries the Orvex fonts and radii", () => {
    expect(theme.fontFamily?.startsWith("system-ui")).toBe(true);
    expect(theme.headings?.fontWeight).toBe("700");
    expect(theme.defaultRadius).toBe("md");
    expect(theme.radius?.md).toBe("10px");
  });

  // AC9
  it("Tabs.extend vars overrides --tabs-color only for color=dark, never throws", () => {
    const tabsVars = (theme.components?.Tabs as any).vars;
    expect(tabsVars(theme, { color: "dark" })).toEqual({
      root: { "--tabs-color": "var(--mantine-color-dark-default)" },
    });
    expect(() => tabsVars(theme, { color: "blue" })).not.toThrow();
    expect(tabsVars(theme, { color: "blue" })).toEqual({ root: {} });
  });

  // AC10
  it("imports only from @mantine/core (no network/runtime asset dependency)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./theme.ts"),
      "utf-8",
    );
    const importSources = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(importSources.every((s) => s === "@mantine/core")).toBe(true);
    expect(src).not.toMatch(/Date\.now|Math\.random|\bfetch\(/);
  });

  // AC4
  it("light CSS resolver pins Orvex surface/text tokens", () => {
    const { light } = mantineCssResolver(resolvedTheme as any);
    expect(light["--mantine-color-body"]).toBe("#ffffff");
    expect(light["--mantine-color-text"]).toBe("#18181d");
    expect(light["--mantine-color-default-border"]).toBe("#ececef");
  });

  // AC5
  it("dark CSS resolver pins Orvex dark tokens", () => {
    const { dark } = mantineCssResolver(resolvedTheme as any);
    expect(dark["--mantine-color-body"]).toBe("#16161c");
    expect(dark["--mantine-color-text"]).toBe("#f0f0f5");
    expect(dark["--mantine-color-default"]).toBe("#1e1e25");
    expect(dark["--mantine-color-default-border"]).toBe("#2d2d38");
  });
});
