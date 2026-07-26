import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import SourceOfferLink from "@/orvex/source-offer/source-offer-link.tsx";
import api from "@/lib/api-client";

// True-external per CS §5: stub the HTTP client boundary (the server
// contract) — never the component itself (own code — ❌#4).
vi.mock("@/lib/api-client", () => ({
  default: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

function renderLink() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <SourceOfferLink />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("TestUiSourceLinkRendersSourceOfferValue (ENG-2500 AC3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a visible link to the source-offer repo labelled with the built sha", async () => {
    mockedGet.mockResolvedValue({
      data: {
        sha: "0123456789abcdef0123456789abcdef01234567",
        sourceRepo: "https://github.com/orvexai/orvex-wiki",
      },
    } as never);

    renderLink();

    const link = await screen.findByRole("link", {
      name: "Source code (AGPL corresponding source)",
    });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/orvexai/orvex-wiki",
    );
    // labelled with the exact built commit (short form) — never a fabricated value
    expect(link.textContent).toBe("Source code (0123456)");
    expect(mockedGet).toHaveBeenCalledWith("/orvex/source");
  });

  test("renders NOTHING when the offer is unavailable — no fabricated sha or URL (CS §11)", async () => {
    mockedGet.mockRejectedValue(new Error("500 source offer not configured"));

    renderLink();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/Source code/)).toBeNull();
  });
});
