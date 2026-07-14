import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { getDefaultStore } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";

// F1 (review ENG-1378): the shipped `case 421` branch in api-client.ts must
// be exercised through the REAL `api` singleton, not a test-authored
// re-implementation of the interceptor. We mock only the true external the
// branch delegates to (reresolveCellOnMismatch — itself independently
// covered in cell-discovery.spec.ts) so a mis-wiring of the shipped branch
// (deleted case, wrong id, wrong arg) fails THIS test.
const reresolveCellOnMismatchSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/cell-discovery/use-cell-discovery.ts", () => ({
  reresolveCellOnMismatch: (...args: unknown[]) =>
    reresolveCellOnMismatchSpy(...args),
}));

const ACCOUNT_ID = "workspace-1";

describe("api-client — shipped 421 interceptor branch (AC4 wiring)", () => {
  beforeEach(() => {
    reresolveCellOnMismatchSpy.mockClear();
    const store = getDefaultStore();
    store.set(currentUserAtom, {
      user: { id: "u1" } as any,
      workspace: { id: ACCOUNT_ID } as any,
    } as any);
  });

  afterEach(() => {
    const store = getDefaultStore();
    store.set(currentUserAtom, null as any);
    vi.restoreAllMocks();
  });

  test("a real 421 response through the `api` singleton calls reresolveCellOnMismatch with the current workspace id", async () => {
    const { default: api } = await import("@/lib/api-client.ts");

    api.defaults.adapter = async () => {
      const err: any = new Error("Misdirected Request");
      err.response = {
        status: 421,
        data: { error: "cell-mismatch" },
        headers: {},
        config: {},
      };
      throw err;
    };

    await expect(api.get("/pages/1")).rejects.toThrow();

    expect(reresolveCellOnMismatchSpy).toHaveBeenCalledTimes(1);
    expect(reresolveCellOnMismatchSpy).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  test("no workspace on the atom => the 421 branch does not call reresolveCellOnMismatch", async () => {
    const store = getDefaultStore();
    store.set(currentUserAtom, null as any);

    const { default: api } = await import("@/lib/api-client.ts");

    api.defaults.adapter = async () => {
      const err: any = new Error("Misdirected Request");
      err.response = {
        status: 421,
        data: { error: "cell-mismatch" },
        headers: {},
        config: {},
      };
      throw err;
    };

    await expect(api.get("/pages/1")).rejects.toThrow();

    expect(reresolveCellOnMismatchSpy).not.toHaveBeenCalled();
  });
});
