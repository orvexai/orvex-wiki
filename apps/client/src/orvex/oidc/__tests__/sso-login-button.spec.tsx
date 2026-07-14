import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SsoLoginButton } from "@/orvex/oidc/components/sso-login-button.tsx";

const LOGIN_URL = "https://idp.example.com/login?workspace=acme";

beforeEach(() => {
  delete (window as unknown as { location: unknown }).location;
  (window as unknown as { location: Location }).location = {
    ...window.location,
    href: "",
  } as Location;
});

describe("AC6: SsoLoginButton", () => {
  test("navigates to the server-derived SSO login URL on click; mints no client token", async () => {
    render(
      <MantineProvider>
        <SsoLoginButton label="Sign in with Acme" loginUrl={LOGIN_URL} />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Acme" }));

    expect(window.location.href).toBe(LOGIN_URL);
  });
});
