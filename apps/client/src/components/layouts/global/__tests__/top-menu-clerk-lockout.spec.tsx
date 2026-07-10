import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import TopMenu from "@/components/layouts/global/top-menu.tsx";

vi.mock("@/features/auth/hooks/use-auth.ts", () => ({
  default: () => ({ logout: vi.fn() }),
}));

const currentUser = {
  user: { id: "u1", name: "Ada", avatarUrl: null },
  workspace: { id: "w1", name: "Acme", logo: null, settings: {} },
};

const ORIGINAL_ENV = { ...process.env };

function setClerkFlag(on: boolean) {
  process.env.CLERK_TENANCY = on ? "true" : "false";
  process.env.CLERK_PUBLISHABLE_KEY = on ? "pk_test_x" : "";
}

function renderTopMenu() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <MemoryRouter>
          <TopMenu />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
});

afterEach(() => {
  localStorage.clear();
  process.env = { ...ORIGINAL_ENV };
});

// AC6: top-menu omits the "Workspace" Menu.Label + items under Clerk tenancy.
describe("AC6: TopMenu Workspace omission", () => {
  test("Clerk tenancy on: dropdown contains no Workspace label", async () => {
    setClerkFlag(true);
    renderTopMenu();

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Account")).not.toBeNull());

    expect(screen.queryByText("Workspace")).toBeNull();
    expect(screen.queryByText("Workspace settings")).toBeNull();
    expect(screen.queryByText("Manage members")).toBeNull();
  });

  test("Clerk tenancy off: dropdown still shows the Workspace label (unchanged behaviour)", async () => {
    setClerkFlag(false);
    renderTopMenu();

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Workspace")).not.toBeNull());

    expect(screen.getByText("Workspace settings")).not.toBeNull();
  });
});
