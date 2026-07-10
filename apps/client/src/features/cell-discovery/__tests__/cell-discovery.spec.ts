import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  renderHook,
  waitFor,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { MantineProvider } from "@mantine/core";
import axios from "axios";
import {
  resolveCell,
  redirectToCellHost,
  reresolveCellOnMismatch,
  useCellDiscovery,
} from "@/features/cell-discovery/use-cell-discovery.ts";
import { pinCell, readPin } from "@/features/cell-discovery/cell-discovery-store.ts";
import { validateCellHost } from "@/features/cell-discovery/cell-host-guard.ts";
import { CellDiscoveryErrorBanner } from "@/features/cell-discovery/cell-discovery-error-banner.tsx";
import { workspaceAtom, currentUserAtom } from "@/features/user/atoms/current-user-atom";
import type { CellDiscoveryClient } from "@/features/cell-discovery/types";

vi.mock("@/lib/config.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config.ts")>(
    "@/lib/config.ts",
  );
  return {
    ...actual,
    getSubdomainHost: vi.fn(() => "wiki.example.com"),
    getGlobalEndpoint: vi.fn(() => "https://global.wiki.example.com"),
  };
});

const ACCOUNT_ID = "workspace-1";
const HOME_HOST = "cell-a.wiki.example.com";
const FOREIGN_HOST = "cell-b.wiki.example.com";

function fakeClient(discovery: () => Promise<{ cellHost: string; cellEpoch: number }>): CellDiscoveryClient & {
  discover: ReturnType<typeof vi.fn>;
} {
  return { discover: vi.fn(discovery) } as unknown as CellDiscoveryClient & {
    discover: ReturnType<typeof vi.fn>;
  };
}

function renderWithWorkspace(hookFn: () => ReturnType<typeof useCellDiscovery>) {
  const store = createStore();
  store.set(currentUserAtom, {
    user: { id: "u1" } as any,
    workspace: { id: ACCOUNT_ID } as any,
  } as any);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(JotaiProvider, { store }, children);
  return renderHook(hookFn, { wrapper });
}

const originalLocationDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "location",
);

function stubLocation(host: string, pathname: string, replaceSpy: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      host,
      href: `https://${host}${pathname}`,
      pathname,
      replace: replaceSpy,
    },
  });
}

function restoreLocation() {
  if (originalLocationDescriptor) {
    Object.defineProperty(window, "location", originalLocationDescriptor);
  }
}

describe("CellDiscoveryBootRedirect.spec", () => {
  let replaceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    replaceSpy = vi.fn();
    stubLocation(HOME_HOST, "/some/path", replaceSpy);
  });

  afterEach(() => {
    restoreLocation();
    vi.restoreAllMocks();
  });

  test("cold boot with a foreign cellHost redirects exactly once to the resolved host with the pin persisted", async () => {
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 3,
    }));

    const { result } = renderWithWorkspace(() =>
      useCellDiscovery({ client, accountId: ACCOUNT_ID }),
    );

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1));

    expect(client.discover).toHaveBeenCalledTimes(1);
    expect(client.discover).toHaveBeenCalledWith(ACCOUNT_ID);

    const redirectUrl = new URL(replaceSpy.mock.calls[0][0] as string);
    expect(redirectUrl.host).toBe(FOREIGN_HOST);
    expect(redirectUrl.pathname).toBe("/some/path");

    expect(readPin(ACCOUNT_ID)).toEqual({
      cellHost: FOREIGN_HOST,
      cellEpoch: 3,
    });
    expect(result.current.error).toBe(false);
  });

  test("a second boot with the pin already set makes zero discovery calls and does not redirect", async () => {
    pinCell(ACCOUNT_ID, { cellHost: FOREIGN_HOST, cellEpoch: 3 });
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 3,
    }));

    renderWithWorkspace(() => useCellDiscovery({ client, accountId: ACCOUNT_ID }));

    // Give any stray microtask a chance to run, then assert nothing fired.
    await new Promise((r) => setTimeout(r, 0));

    expect(client.discover).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});

describe("resolveCell (unit)", () => {
  beforeEach(() => sessionStorage.clear());

  test("AC1 — cold boot calls the discovery client once and returns a typed decision", async () => {
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 1,
    }));
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(client.discover).toHaveBeenCalledTimes(1);
    expect(decision).toEqual({
      outcome: "redirect",
      cellHost: FOREIGN_HOST,
      cellEpoch: 1,
    });
  });

  test("AC2 — resolved host differs from current host => redirect decision", async () => {
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 1,
    }));
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(decision.outcome).toBe("redirect");
  });

  test("AC3 — a pin already stored short-circuits with zero discovery calls", async () => {
    pinCell(ACCOUNT_ID, { cellHost: FOREIGN_HOST, cellEpoch: 5 });
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 5,
    }));
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(client.discover).not.toHaveBeenCalled();
    expect(decision).toEqual({
      outcome: "pinned",
      cellHost: FOREIGN_HOST,
      cellEpoch: 5,
    });
  });

  test("AC6 — resolved host equals current host => noop decision, pin still persisted", async () => {
    const client = fakeClient(async () => ({
      cellHost: HOME_HOST,
      cellEpoch: 2,
    }));
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(decision).toEqual({ outcome: "noop", cellHost: HOME_HOST, cellEpoch: 2 });
    expect(readPin(ACCOUNT_ID)).toEqual({ cellHost: HOME_HOST, cellEpoch: 2 });
  });

  test("AC5 — discovery failure (5xx/timeout) never throws, resolves to an error decision", async () => {
    const client = fakeClient(async () => {
      throw new Error("network timeout");
    });
    await expect(resolveCell(client, ACCOUNT_ID, HOME_HOST)).resolves.toEqual({
      outcome: "error",
    });
  });

  test("AC7 — a superset discovery payload is read down to only cellHost + cellEpoch", async () => {
    const client = fakeClient(async () =>
      ({
        cellHost: FOREIGN_HOST,
        cellEpoch: 9,
        futureField: "ignored",
        anotherOne: { nested: true },
      }) as any,
    );
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(decision).toEqual({
      outcome: "redirect",
      cellHost: FOREIGN_HOST,
      cellEpoch: 9,
    });
  });

  test("open-redirect guard — an off-allow-list cellHost is rejected, never pinned, never redirected", async () => {
    const client = fakeClient(async () => ({
      cellHost: "evil.attacker.com",
      cellEpoch: 1,
    }));
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(decision).toEqual({ outcome: "error" });
    expect(readPin(ACCOUNT_ID)).toBeNull();
  });
});

describe("cell-host-guard (unit)", () => {
  test("accepts the root and subdomains of it, rejects everything else", () => {
    expect(validateCellHost("wiki.example.com")).toBe(true);
    expect(validateCellHost("cell-a.wiki.example.com")).toBe(true);
    expect(validateCellHost("evil.com")).toBe(false);
    expect(validateCellHost("wiki.example.com.evil.com")).toBe(false);
    expect(validateCellHost("")).toBe(false);
    expect(validateCellHost(undefined)).toBe(false);
  });
});

describe("pin lifecycle (unit, jsdom sessionStorage)", () => {
  beforeEach(() => sessionStorage.clear());

  test("set / read / clear round-trip", () => {
    expect(readPin(ACCOUNT_ID)).toBeNull();
    pinCell(ACCOUNT_ID, { cellHost: FOREIGN_HOST, cellEpoch: 4 });
    expect(readPin(ACCOUNT_ID)).toEqual({ cellHost: FOREIGN_HOST, cellEpoch: 4 });
  });

  test("clearPin removes the pin so the next resolveCell re-discovers", async () => {
    pinCell(ACCOUNT_ID, { cellHost: FOREIGN_HOST, cellEpoch: 4 });
    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 6,
    }));
    await import("@/features/cell-discovery/cell-discovery-store.ts").then(
      ({ clearPin }) => clearPin(ACCOUNT_ID),
    );
    const decision = await resolveCell(client, ACCOUNT_ID, HOME_HOST);
    expect(client.discover).toHaveBeenCalledTimes(1);
    expect(decision).toEqual({
      outcome: "redirect",
      cellHost: FOREIGN_HOST,
      cellEpoch: 6,
    });
  });
});

describe("AC4 — 421 re-resolution (integration, real axios instance + mock adapter)", () => {
  let replaceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    replaceSpy = vi.fn();
    stubLocation(HOME_HOST, "/docs/1", replaceSpy);
    pinCell(ACCOUNT_ID, { cellHost: HOME_HOST, cellEpoch: 1 });
  });

  afterEach(() => {
    restoreLocation();
    vi.restoreAllMocks();
  });

  test("clearing the pin and re-resolving after a real 421 response redirects to the newly resolved cell host", async () => {
    // A real axios instance driven through a custom transport adapter that
    // simulates the API returning HTTP 421 with a cell-mismatch body — no
    // hand-authored production HTTP, just axios's own adapter seam.
    const instance = axios.create({ baseURL: "/api" });
    instance.interceptors.response.use(
      (r) => r,
      (error) => {
        if (error.response?.status === 421) {
          return reresolveCellOnMismatch(ACCOUNT_ID, client).then(() =>
            Promise.reject(error),
          );
        }
        return Promise.reject(error);
      },
    );

    const client = fakeClient(async () => ({
      cellHost: FOREIGN_HOST,
      cellEpoch: 2,
    }));

    instance.defaults.adapter = async () => {
      const err: any = new Error("Misdirected Request");
      err.response = {
        status: 421,
        data: { error: "cell-mismatch" },
        headers: {},
        config: {},
      };
      throw err;
    };

    await expect(instance.get("/pages/1")).rejects.toThrow();

    expect(readPin(ACCOUNT_ID)).toEqual({ cellHost: FOREIGN_HOST, cellEpoch: 2 });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const redirectUrl = new URL(replaceSpy.mock.calls[0][0] as string);
    expect(redirectUrl.host).toBe(FOREIGN_HOST);
    expect(redirectUrl.pathname).toBe("/docs/1");
  });
});

describe("AC5 — boot-failure banner (component)", () => {
  test("renders a visible retry affordance and calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CellDiscoveryErrorBanner, { onRetry }),
      ),
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(document.body.innerHTML).not.toBe("");

    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
