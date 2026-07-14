import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { MantineProvider } from "@mantine/core";
import GlobalSidebar from "@/components/layouts/global/global-sidebar.tsx";

const favoriteSpaces = [
  { id: "fav-1", space: { id: "space-1", name: "Alpha", slug: "alpha", logo: null } },
  // duplicate favorite entry for the same space (e.g. overlapping realtime +
  // fetched pages) — must be de-duplicated by space id.
  { id: "fav-1-dup", space: { id: "space-1", name: "Alpha", slug: "alpha", logo: null } },
  { id: "fav-2", space: { id: "space-2", name: "Beta", slug: "beta", logo: null } },
];

vi.mock("@/features/favorite/queries/favorite-query.ts", () => ({
  useFavoritesQuery: vi.fn(() => ({
    data: { pages: [{ items: favoriteSpaces }] },
    isPending: false,
  })),
}));

function renderSidebar(initialPath: string) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <JotaiProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <GlobalSidebar />
          </MemoryRouter>
        </QueryClientProvider>
      </JotaiProvider>
    </MantineProvider>,
  );
}

describe("AC5: GlobalSidebar active nav + favorites", () => {
  test("derives the active nav item from the current location", () => {
    renderSidebar("/favorites");
    const favoritesLink = screen.getByRole("link", { name: /Favorites/i });
    expect(favoritesLink.getAttribute("aria-current")).toBe("page");

    const homeLink = screen.getByRole("link", { name: /Home/i });
    expect(homeLink.getAttribute("aria-current")).toBeNull();
  });

  test("renders favorite spaces without duplicate ids even when the same space id repeats", () => {
    renderSidebar("/home");
    // "Alpha" (space-1) appears twice in the favorites payload (duplicate
    // realtime + fetched entries) — it must render exactly once.
    expect(screen.getAllByText("Alpha")).toHaveLength(1);
    expect(screen.getAllByText("Beta")).toHaveLength(1);
  });
});
