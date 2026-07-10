import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { redirectToLogin } from "@/lib/api-client.ts";
import APP_ROUTE from "@/lib/app-route.ts";

const ORIGINAL_ENV = { ...process.env };

function setClerkFlag(on: boolean) {
  process.env.CLERK_TENANCY = on ? "true" : "false";
  process.env.CLERK_PUBLISHABLE_KEY = on ? "pk_test_x" : "";
}

beforeEach(() => {
  delete (window as unknown as { location: unknown }).location;
  (window as unknown as { location: Location }).location = {
    ...window.location,
    href: "",
    pathname: "/home",
  } as Location;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// AC4: redirectToLogin() chooses CLERK_LOGIN_ROUTE iff isClerkTenancy().
describe("AC4: redirectToLogin tenancy branch", () => {
  test("Clerk tenancy on: 401 redirect target is /clerk", () => {
    setClerkFlag(true);
    redirectToLogin();
    expect(window.location.href).toBe(APP_ROUTE.AUTH.CLERK_LOGIN);
  });

  test("Clerk tenancy off: 401 redirect target is /login (unchanged behaviour)", () => {
    setClerkFlag(false);
    redirectToLogin();
    expect(window.location.href).toBe(APP_ROUTE.AUTH.LOGIN);
  });

  test("/clerk is an exempt path (no self-redirect loop) when Clerk tenancy is on", () => {
    setClerkFlag(true);
    (window as unknown as { location: Location }).location = {
      ...window.location,
      href: "",
      pathname: "/clerk",
    } as Location;
    redirectToLogin();
    expect(window.location.href).toBe("");
  });
});
