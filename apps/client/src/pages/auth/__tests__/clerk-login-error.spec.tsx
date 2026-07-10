import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { HelmetProvider } from "react-helmet-async";
import ClerkLoginPage from "@/pages/auth/clerk-login.tsx";
import api from "@/lib/api-client.ts";

const mockGetToken = vi.fn(async () => "clerk-session-token");

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: mockGetToken }),
  useOrganization: () => ({ organization: { name: "Acme" } }),
  SignIn: () => <div data-testid="clerk-sign-in" />,
  OrganizationList: () => <div data-testid="clerk-org-list" />,
}));

vi.mock("@/lib/api-client.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client.ts")>(
    "@/lib/api-client.ts",
  );
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});

function renderPage() {
  return render(
    <HelmetProvider>
      <MantineProvider>
        <ClerkLoginPage />
      </MantineProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  (api.post as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// AC7: exchange failure never white-screens — inline error, button re-enabled.
describe("AC7: ClerkLoginPage exchange-failure handling", () => {
  test("shows the server error message inline and re-enables the button on a 4xx", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: "Organization not provisioned yet" } },
    });

    renderPage();
    const enterButton = screen.getByRole("button", { name: "Enter workspace" });
    fireEvent.click(enterButton);

    await waitFor(() => {
      expect(screen.getByTestId("clerk-enter-error").textContent).toContain(
        "Organization not provisioned yet",
      );
    });
    await waitFor(() => {
      expect(enterButton.getAttribute("data-loading")).not.toBe("true");
    });
    expect(enterButton.hasAttribute("disabled")).toBe(false);
  });

  test("falls back to a generic message when the server sends none", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Enter workspace" }));

    await waitFor(() => {
      expect(screen.getByTestId("clerk-enter-error")).not.toBeNull();
    });
  });
});
