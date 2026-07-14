import { describe, test, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { ClerkAppProvider } from "@/features/clerk/clerk-app-provider.tsx";
import ClerkLoginPage from "@/pages/auth/clerk-login.tsx";
import App from "@/App.tsx";

// ENG-1387 review1 F1: ClerkAppProvider (AC1) was never mounted around the
// /clerk route in App.tsx. Page-level specs mock @clerk/react wholesale,
// which hides a missing-provider bug entirely (the mocked hooks never
// consult React context). This spec deliberately does NOT mock
// @clerk/react — it exercises the real package's own
// useAssertWrappedByClerkProvider() context check, mirroring exactly the
// <ClerkAppProvider><ClerkLoginPage /></ClerkAppProvider> composition
// App.tsx's /clerk route must produce (CS §5: mock only true externals,
// never hide the seam under test).
function setClerkFlag(on: boolean) {
  process.env.CLERK_TENANCY = on ? "true" : "false";
  process.env.CLERK_PUBLISHABLE_KEY = on
    ? "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk"
    : "";
}

function renderWithHelmet(children: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MantineProvider>{children}</MantineProvider>
    </HelmetProvider>,
  );
}

afterEach(() => {
  delete process.env.CLERK_TENANCY;
  delete process.env.CLERK_PUBLISHABLE_KEY;
});

describe("ENG-1387 F1: ClerkAppProvider must actually wrap the /clerk route", () => {
  test("un-wrapped: ClerkLoginPage throws the real @clerk/react missing-provider error", () => {
    setClerkFlag(true);
    // No ClerkAppProvider ancestor — this is the exact broken production
    // shape App.tsx shipped before the fix (route element with no
    // ClerkProvider ancestor). Assert the real package really does throw,
    // proving the mocked page specs were masking a live bug.
    expect(() => renderWithHelmet(<ClerkLoginPage />)).toThrow(
      /ClerkProvider/i,
    );
  });

  test("wrapped: ClerkAppProvider around ClerkLoginPage mounts cleanly under flag-on (the required App.tsx wiring)", () => {
    setClerkFlag(true);
    expect(() =>
      renderWithHelmet(
        <ClerkAppProvider>
          <ClerkLoginPage />
        </ClerkAppProvider>,
      ),
    ).not.toThrow();
  });

  // The real regression: App.tsx registers the /clerk route directly with
  // no ClerkAppProvider ancestor. This mounts the actual App component
  // (real @clerk/react, not mocked) at /clerk under flag-on and asserts it
  // does not throw — this is the test that must fail before the App.tsx
  // fix and pass after it.
  test("App.tsx: navigating to /clerk under flag-on does not throw the missing-provider error", () => {
    setClerkFlag(true);
    expect(() =>
      render(
        <HelmetProvider>
          <MantineProvider>
            <MemoryRouter initialEntries={["/clerk"]}>
              <App />
            </MemoryRouter>
          </MantineProvider>
        </HelmetProvider>,
      ),
    ).not.toThrow();
  });
});
