import { describe, test, expect, vi, afterEach } from "vitest";
import axios from "axios";
import { createCellDiscoveryClient } from "@/features/cell-discovery/cell-discovery-client.ts";

// F2 (review ENG-1378): the real (axios-backed) discovery adapter — URL
// construction and String/Number narrowing — was never exercised; every
// other test injects a fakeClient. Mock only the true external (the HTTP
// call itself, via axios.get) per CS §5, so the adapter's own request-shape
// and field-narrowing logic run for real.
vi.mock("@/lib/config.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config.ts")>(
    "@/lib/config.ts",
  );
  return {
    ...actual,
    getGlobalEndpoint: vi.fn(() => "https://global.wiki.example.com"),
  };
});

describe("createCellDiscoveryClient (real adapter)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC1 — issues a real GET to `${endpoint}/discovery` with accountId as a query param", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({
      data: { cellHost: "cell-a.wiki.example.com", cellEpoch: 3 },
    });

    const client = createCellDiscoveryClient();
    const result = await client.discover("workspace-1");

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(
      "https://global.wiki.example.com/discovery",
      { params: { accountId: "workspace-1" } },
    );
    expect(result).toEqual({
      cellHost: "cell-a.wiki.example.com",
      cellEpoch: 3,
    });
  });

  test("AC7 — narrows a superset response down to String(cellHost)/Number(cellEpoch), coercing wire types", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      // wire payload where cellEpoch arrives as a numeric string (server
      // JSON quirk) plus additive fields the client must ignore.
      data: {
        cellHost: "cell-b.wiki.example.com",
        cellEpoch: "7",
        futureField: "ignored",
      },
    });

    const client = createCellDiscoveryClient();
    const result = await client.discover("workspace-1");

    expect(result).toEqual({
      cellHost: "cell-b.wiki.example.com",
      cellEpoch: 7,
    });
    expect(typeof result.cellEpoch).toBe("number");
    expect(Object.keys(result)).toEqual(["cellHost", "cellEpoch"]);
  });

  test("a missing response body still narrows to typed (if unusable) values rather than throwing", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: undefined });

    const client = createCellDiscoveryClient();
    const result = await client.discover("workspace-1");

    expect(result.cellHost).toBe("undefined");
    expect(Number.isNaN(result.cellEpoch)).toBe(true);
  });
});
