import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { notifications } from "@mantine/notifications";
import { OidcErrorToast } from "@/orvex/oidc/components/oidc-error-toast.tsx";

// True-external (a library edge, not our own code) — assert via the real
// notifications spy per CS §4f.
vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AC5: OidcErrorToast", () => {
  test("shows exactly ONE notification and cleans the oidcError param from the URL", async () => {
    window.history.replaceState({}, "", "/login?oidcError=access_denied&redirect=%2Fhome");

    render(<OidcErrorToast />);

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledTimes(1);
    });
    expect(window.location.search).not.toContain("oidcError");
    // Unrelated params are preserved — only oidcError is stripped.
    expect(window.location.search).toContain("redirect=%2Fhome");
  });

  test("does nothing when there is no oidcError param", async () => {
    window.history.replaceState({}, "", "/login");

    render(<OidcErrorToast />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifications.show).not.toHaveBeenCalled();
  });
});
