import { describe, test, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AutoRedirect } from "@/orvex/oidc/components/auto-redirect.tsx";

const LOGIN_URL = "https://idp.example.com/login";

beforeEach(() => {
  delete (window as unknown as { location: unknown }).location;
  (window as unknown as { location: Location }).location = {
    ...window.location,
    href: "",
  } as Location;
});

describe("AC3: AutoRedirect", () => {
  test("redirects when enabled + autoRedirect + enforceSso + hostname + loginUrl all agree", async () => {
    render(
      <AutoRedirect
        hostname="acme.example.com"
        enabled
        autoRedirect
        enforceSso
        loginUrl={LOGIN_URL}
      />,
    );
    await waitFor(() => expect(window.location.href).toBe(LOGIN_URL));
  });

  test("does not redirect when autoRedirect (server) is false", async () => {
    render(
      <AutoRedirect
        hostname="acme.example.com"
        enabled
        autoRedirect={false}
        enforceSso
        loginUrl={LOGIN_URL}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });

  test("does not redirect when enforceSso (workspace) is false", async () => {
    render(
      <AutoRedirect
        hostname="acme.example.com"
        enabled
        autoRedirect
        enforceSso={false}
        loginUrl={LOGIN_URL}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });

  test("does not redirect when enabled (server) is false", async () => {
    render(
      <AutoRedirect
        hostname="acme.example.com"
        enabled={false}
        autoRedirect
        enforceSso
        loginUrl={LOGIN_URL}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });

  test("does not redirect when hostname is missing", async () => {
    render(
      <AutoRedirect enabled autoRedirect enforceSso loginUrl={LOGIN_URL} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.href).toBe("");
  });
});
