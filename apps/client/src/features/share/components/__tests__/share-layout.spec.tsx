import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { MantineProvider } from "@mantine/core";
import { HelmetProvider } from "react-helmet-async";
import ShareLayout from "@/features/share/components/share-layout.tsx";
import { Error404 } from "@/components/ui/error-404.tsx";

vi.mock("@/features/share/queries/share-query.ts", () => ({
  useGetSharedPageTreeQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
  })),
}));

function renderShareLayout() {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <HelmetProvider>
        <JotaiProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/share/missing/p/nope"]}>
              <Routes>
                <Route element={<ShareLayout />}>
                  <Route
                    path="/share/:shareId/p/:pageSlug"
                    element={<Error404 />}
                  />
                </Route>
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </JotaiProvider>
      </HelmetProvider>
    </MantineProvider>,
  );
}

describe("AC7: ShareLayout renders a graceful state for a null share, never a white screen", () => {
  test("renders without throwing and shows a visible affordance instead of a blank page", () => {
    expect(() => renderShareLayout()).not.toThrow();
    expect(
      screen.getAllByText(/page not found|can't find the page/i).length,
    ).toBeGreaterThan(0);
  });
});
