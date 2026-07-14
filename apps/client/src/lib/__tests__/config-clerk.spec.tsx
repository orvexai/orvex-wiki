import { describe, test, expect, afterEach } from "vitest";
import { getClerkPublishableKey, isClerkTenancy } from "@/lib/config.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// isClerkTenancy/getClerkPublishableKey are the sole flag-read surface
// (CS §6). Tenancy requires both the flag AND a publishable key.
describe("isClerkTenancy / getClerkPublishableKey", () => {
  test("false when the flag is unset", () => {
    delete process.env.CLERK_TENANCY;
    delete process.env.CLERK_PUBLISHABLE_KEY;
    expect(isClerkTenancy()).toBe(false);
  });

  test("false when flag true but no publishable key (never a half-enabled state)", () => {
    process.env.CLERK_TENANCY = "true";
    delete process.env.CLERK_PUBLISHABLE_KEY;
    expect(isClerkTenancy()).toBe(false);
  });

  test("false when a publishable key exists but the flag is off", () => {
    process.env.CLERK_TENANCY = "false";
    process.env.CLERK_PUBLISHABLE_KEY = "pk_test_x";
    expect(isClerkTenancy()).toBe(false);
  });

  test("true when both the flag and publishable key are set", () => {
    process.env.CLERK_TENANCY = "true";
    process.env.CLERK_PUBLISHABLE_KEY = "pk_test_x";
    expect(isClerkTenancy()).toBe(true);
    expect(getClerkPublishableKey()).toBe("pk_test_x");
  });
});
