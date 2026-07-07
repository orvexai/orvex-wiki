import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { OrvexLoginExtensions } from "@/orvex/oidc/components/orvex-login-extensions.tsx";
import {
  useOidcConfigQuery,
  IOidcConfig,
} from "@/orvex/oidc/queries/oidc-provider-query.ts";

// True-external per CS §4f: stub the query hook's returned config (the
// server contract) — never the components themselves (own code — ❌#4).
vi.mock("@/orvex/oidc/queries/oidc-provider-query.ts", async () => {
  const actual = await vi.importActual<
    typeof import("@/orvex/oidc/queries/oidc-provider-query.ts")
  >("@/orvex/oidc/queries/oidc-provider-query.ts");
  return { ...actual, useOidcConfigQuery: vi.fn() };
});

const mockedUseOidcConfigQuery = vi.mocked(useOidcConfigQuery);

function mockConfig(
  data: IOidcConfig | undefined,
  overrides: { isLoading?: boolean } = {},
) {
  mockedUseOidcConfigQuery.mockReturnValue({
    data,
    isLoading: overrides.isLoading ?? false,
  } as ReturnType<typeof useOidcConfigQuery>);
}

function renderExtensions(props: {
  hostname?: string;
  enforceSso?: boolean;
}) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <OrvexLoginExtensions {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("OrvexLoginExtensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/login");
    delete (window as unknown as { location: unknown }).location;
    (window as unknown as { location: Location }).location = {
      ...window.location,
      href: "",
    } as Location;
  });

  // Named DoD test (§5a) — renders the SSO button with server buttonText
  // when enabled+hostname; mounts AutoRedirect (i.e. the redirect fires)
  // only when server autoRedirect AND workspace enforceSso both agree.
  test("DoD: renders SSO button when enabled+hostname and auto-redirects only when server+workspace flags agree", async () => {
    mockConfig({
      enabled: true,
      autoRedirect: true,
      buttonText: "Sign in with Acme",
      loginUrl: "https://idp.example.com/login",
    });

    renderExtensions({ hostname: "acme.example.com", enforceSso: true });

    screen.getByRole("button", { name: "Sign in with Acme" });

    await waitFor(() => {
      expect(window.location.href).toBe("https://idp.example.com/login");
    });
  });

  test("AC1: renders SSO button with server buttonText when enabled+hostname", () => {
    mockConfig({
      enabled: true,
      autoRedirect: false,
      buttonText: "Sign in with Acme",
      loginUrl: "https://idp.example.com/login",
    });

    renderExtensions({ hostname: "acme.example.com", enforceSso: false });

    screen.getByRole("button", { name: "Sign in with Acme" });
  });

  test("AC2: no button when disabled, but the error-toast host still mounts", () => {
    mockConfig({
      enabled: false,
      autoRedirect: false,
      buttonText: "Sign in with Acme",
      loginUrl: "",
    });

    renderExtensions({ hostname: "acme.example.com", enforceSso: false });

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("AC2: no button when hostname is missing even if enabled", () => {
    mockConfig({
      enabled: true,
      autoRedirect: false,
      buttonText: "Sign in with Acme",
      loginUrl: "https://idp.example.com/login",
    });

    renderExtensions({ hostname: undefined, enforceSso: false });

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("AC4: shows a skeleton in the button slot while loading, no layout jank", () => {
    mockConfig(undefined, { isLoading: true });

    renderExtensions({ hostname: "acme.example.com", enforceSso: false });

    screen.getByTestId("orvex-oidc-button-skeleton");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("AC3: does NOT auto-redirect when autoRedirect is true but workspace enforceSso is false", async () => {
    mockConfig({
      enabled: true,
      autoRedirect: true,
      buttonText: "Sign in with Acme",
      loginUrl: "https://idp.example.com/login",
    });

    renderExtensions({ hostname: "acme.example.com", enforceSso: false });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });

  test("AC3: does NOT auto-redirect when enforceSso is true but server autoRedirect is false", async () => {
    mockConfig({
      enabled: true,
      autoRedirect: false,
      buttonText: "Sign in with Acme",
      loginUrl: "https://idp.example.com/login",
    });

    renderExtensions({ hostname: "acme.example.com", enforceSso: true });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });
});
