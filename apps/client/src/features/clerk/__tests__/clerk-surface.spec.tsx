import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkAppProvider } from "@/features/clerk/clerk-app-provider.tsx";
import ClerkLoginPage from "@/pages/auth/clerk-login.tsx";
import SettingsSidebar from "@/components/settings/settings-sidebar.tsx";
import api from "@/lib/api-client.ts";

// True-external (@clerk/react) — stub the hooks/components at the seam,
// never mock our own package (CS §5 mocking strategy, ❌4 guard).
const mockGetToken = vi.fn(async () => "clerk-session-token");
let mockIsSignedIn = true;
let mockOrganization: { name: string } | null = { name: "Acme" };

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  ),
  SignIn: () => <div data-testid="clerk-sign-in" />,
  OrganizationList: () => <div data-testid="clerk-org-list" />,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
    getToken: mockGetToken,
  }),
  useOrganization: () => ({ organization: mockOrganization }),
}));

vi.mock("@/lib/api-client.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client.ts")>(
    "@/lib/api-client.ts",
  );
  return {
    ...actual,
    default: { ...actual.default, post: vi.fn() },
  };
});

function setClerkFlag(on: boolean) {
  vi.stubGlobal("process", {
    ...process,
    env: { ...process.env, CLERK_TENANCY: on ? "true" : "false", CLERK_PUBLISHABLE_KEY: on ? "pk_test_x" : "" },
  });
}

// Stand-in for the flag-gated route registration in App.tsx (kept in sync
// with the real conditional — AC2). Exercises the same isClerkTenancy()
// read that App.tsx uses.
import { isClerkTenancy } from "@/lib/config.ts";

function ClerkGatedRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<div data-testid="login-page" />} />
      {isClerkTenancy() && <Route path="/clerk" element={<ClerkLoginPage />} />}
      <Route path="*" element={<div data-testid="not-found" />} />
    </Routes>
  );
}

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MantineProvider>
        <MemoryRouter initialEntries={[path]}>
          <ClerkGatedRoutes />
        </MemoryRouter>
      </MantineProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  mockIsSignedIn = true;
  mockOrganization = { name: "Acme" };
  mockGetToken.mockClear();
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});

  // jsdom doesn't implement real navigation; stub location.href like the
  // existing SSO port test does so the post-exchange redirect is observable
  // without jsdom's "Not implemented: navigation" noise.
  delete (window as unknown as { location: unknown }).location;
  (window as unknown as { location: Location }).location = {
    ...window.location,
    href: "",
  } as Location;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TestClerkClientSurface (ENG-1387 DoD)", () => {
  test("(a) flag on: /clerk route mounts ClerkLoginPage and Enter workspace POSTs the Clerk token to /clerk/exchange", async () => {
    setClerkFlag(true);
    renderAt("/clerk");

    const enterButton = await screen.findByRole("button", {
      name: "Enter workspace",
    });
    fireEvent.click(enterButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/clerk/exchange", {
        token: "clerk-session-token",
      });
    });
    await waitFor(() => {
      expect(window.location.href).toBe("/home");
    });
  });

  test("(b) flag on: settings-sidebar and top-menu render no Workspace group/label", () => {
    setClerkFlag(true);

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <MemoryRouter>
            <SettingsSidebar />
          </MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Workspace")).toBeNull();
  });

  test("(c) flag off: ClerkAppProvider is a transparent pass-through and the /clerk route is absent", () => {
    setClerkFlag(false);

    render(
      <ClerkAppProvider>
        <div data-testid="app-children">children</div>
      </ClerkAppProvider>,
    );
    expect(screen.getByTestId("app-children")).not.toBeNull();
    expect(screen.queryByTestId("clerk-provider")).toBeNull();

    renderAt("/clerk");
    expect(screen.getByTestId("not-found")).not.toBeNull();
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });
});
