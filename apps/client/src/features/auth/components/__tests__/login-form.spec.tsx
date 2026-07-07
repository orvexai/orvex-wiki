import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { MantineProvider } from "@mantine/core";
import { LoginForm } from "@/features/auth/components/login-form.tsx";
import { useOidcConfigQuery } from "@/orvex/oidc/queries/oidc-provider-query.ts";

vi.mock("@/features/workspace/queries/workspace-query.ts", () => ({
  useWorkspacePublicDataQuery: vi.fn(() => ({
    data: {
      id: "ws-1",
      name: "Acme",
      logo: null,
      hostname: "acme.example.com",
      enforceSso: false,
      authProviders: [
        { id: "provider-1", name: "Okta", type: "saml" },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  })),
}));

vi.mock("@/features/user/hooks/use-current-user.ts", () => ({
  default: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock("@/orvex/oidc/queries/oidc-provider-query.ts", async () => {
  const actual = await vi.importActual<
    typeof import("@/orvex/oidc/queries/oidc-provider-query.ts")
  >("@/orvex/oidc/queries/oidc-provider-query.ts");
  return { ...actual, useOidcConfigQuery: vi.fn() };
});

const mockedUseOidcConfigQuery = vi.mocked(useOidcConfigQuery);

function renderLoginForm() {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <JotaiProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/login"]}>
            <LoginForm />
          </MemoryRouter>
        </QueryClientProvider>
      </JotaiProvider>
    </MantineProvider>,
  );
}

describe("AC7: login-form coexistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseOidcConfigQuery.mockReturnValue({
      data: {
        enabled: true,
        autoRedirect: false,
        buttonText: "Sign in with OIDC",
        loginUrl: "https://idp.example.com/login",
      },
      isLoading: false,
    } as ReturnType<typeof useOidcConfigQuery>);
  });

  test("upstream SsoLogin and OrvexLoginExtensions both render without duplication", () => {
    renderLoginForm();

    // Upstream provider-based SSO button (existing docmost SsoLogin).
    screen.getByRole("button", { name: "Okta" });
    // New config-driven OIDC button, mounted beneath it.
    screen.getByRole("button", { name: "Sign in with OIDC" });
  });
});
