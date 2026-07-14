import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import api from "@/lib/api-client";
import { PagePermissionTab } from "@/ee/page-permission/components/page-permission-tab";
import { usePageRestrictionInfoQuery } from "@/ee/page-permission/queries/page-permission-query";
import {
  IPageRestrictionInfo,
  PagePermissionRole,
} from "@/ee/page-permission/types/page-permission.types";

// CS §5 mocking rule: the engine (HTTP) is a true external to this UI —
// inject the transport and drive it. `useSearchSuggestionsQuery` belongs to
// the (unrelated) search feature, not this ticket's own package, so mocking
// it to skip its debounce/network round-trip is allowed; the page-permission
// hooks/services under test are NEVER mocked — they run for real against the
// mocked transport below.
vi.mock("@/features/search/queries/search-query", () => {
  // Stable object identity across renders (own-hook effects key off this
  // reference) — a fresh literal per call would re-trigger the consuming
  // effect on every render and infinite-loop.
  const suggestionResult = {
    data: {
      users: [
        {
          id: "user-42",
          name: "Ada Lovelace",
          email: "ada@example.com",
          avatarUrl: null,
        },
      ],
      groups: [],
    },
    isLoading: false,
  };
  return {
    useSearchSuggestionsQuery: () => suggestionResult,
  };
});

// Mantine's Menu (Floating UI `useClick`) opens on `pointerdown`, not on a
// bare synthetic `click` — fire the native interaction sequence a real
// pointer/mouse click produces so the dropdown actually opens under jsdom.
function clickOpen(element: Element) {
  fireEvent.pointerDown(element, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.mouseDown(element);
  fireEvent.pointerUp(element, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

const PAGE_ID = "page-1";

// Committed replay of the real engine responses. The `restrict` and
// `add-permission` response shapes are copied verbatim from
// `apps/server/src/core/permissions/page-permission.controller.ts`:
//   - `restrict` returns `{ pageAccess }` (`insertPageAccess` row), and the
//     controller unconditionally grants the restricting admin WRITER access
//     in the same transaction ("the restricting admin is granted writer
//     immediately, so restricting a page never produces an orphaned
//     no-writer restricted page" — controller comment).
//   - `add-permission` returns `{ success: true }` and only accepts a
//     singular `userId`/`groupId` (`assertSinglePrincipal`) — the fake
//     rejects an `userIds`/`groupIds` array payload exactly as the real
//     controller's DTO validation would, so this test cannot pass against a
//     client that regresses back to batched-array grants (ENG-1375 fix
//     pass 1).
// `/pages/permission-info` and `/pages/permissions` (list/info reads) have
// NO engine controller yet — that gap is tracked separately in ENG-1596
// (blocked-by this ticket, per the PD-4d orchestrator ruling). The shapes
// returned below are the `IPageRestrictionInfo`/`IPagination<IPagePermissionMember>`
// contracts already committed in this package's own
// `types/page-permission.types.ts` — not fabricated data — so the fake
// models the documented target contract, not an invented one, and mirrors
// the controller's own real mutation-side invariants above.
function installFakeEngine() {
  const ADMIN_MEMBER = {
    id: "current-user",
    type: "user" as const,
    name: "Current User",
    email: "current-user@example.com",
    avatarUrl: null,
    role: PagePermissionRole.WRITER,
    createdAt: "2026-07-08T00:00:00.000Z",
  };

  let restricted = false;
  const permissions: any[] = [];

  const post = vi.spyOn(api, "post").mockImplementation(((
    url: string,
    body?: any,
  ) => {
    if (url === "/page-permissions/restrict") {
      restricted = true;
      permissions.length = 0;
      permissions.push(ADMIN_MEMBER);
      return Promise.resolve({
        data: { pageAccess: { id: "access-1", pageId: body.pageId } },
      });
    }
    if (url === "/page-permissions/remove-restriction") {
      restricted = false;
      permissions.length = 0;
      return Promise.resolve({ data: { success: true } });
    }
    if (url === "/page-permissions/add-permission") {
      // Mirrors the shipped `AddPagePermissionDto` + `assertSinglePrincipal`
      // (apps/server/.../page-permission.controller.ts): exactly one of
      // `userId`/`groupId` singular, never arrays. A payload carrying
      // `userIds`/`groupIds` here is what the real controller 400s on, so
      // fail loud instead of quietly accepting it like the real DTO would
      // reject.
      if ((body as any).userIds || (body as any).groupIds) {
        return Promise.reject(
          new Error(
            "add-permission payload must use singular userId/groupId, not arrays",
          ),
        );
      }
      if (!body.userId && !body.groupId) {
        return Promise.reject(
          new Error("Provide either userId or groupId"),
        );
      }
      permissions.push({
        id: body.userId ?? body.groupId,
        type: body.userId ? ("user" as const) : ("group" as const),
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: null,
        role: body.role,
        createdAt: "2026-07-08T00:00:01.000Z",
      });
      return Promise.resolve({ data: { success: true } });
    }
    if (url === "/pages/permission-info") {
      const info: IPageRestrictionInfo = {
        hasDirectRestriction: restricted,
        hasInheritedRestriction: false,
        userAccess: { canView: true, canEdit: true, canManage: true },
      };
      return Promise.resolve({ data: info });
    }
    if (url === "/pages/permissions") {
      return Promise.resolve({
        data: {
          items: permissions,
          meta: {
            limit: 20,
            hasNextPage: false,
            hasPrevPage: false,
            nextCursor: null,
            prevCursor: null,
          },
        },
      });
    }
    return Promise.reject(new Error(`unmocked POST ${url}`));
  }) as any);

  return { post, isRestricted: () => restricted };
}

// Mirrors the real composition in `PageShareModal` (source of truth for how
// `PagePermissionTab` is actually driven in production): a parent sources
// `restrictionInfo` from `usePageRestrictionInfoQuery` and re-renders the
// (purely presentational) tab whenever that query's data changes — which is
// exactly what happens after a restrict/unrestrict mutation invalidates it.
function Harness({ pageId }: { pageId: string }) {
  const { data: restrictionInfo, isLoading } =
    usePageRestrictionInfoQuery(pageId);
  if (isLoading || !restrictionInfo) {
    return <div>Loading…</div>;
  }
  return (
    <PagePermissionTab pageId={pageId} restrictionInfo={restrictionInfo} />
  );
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/s/space/p/page-1"]}>
          <Harness pageId={PAGE_ID} />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("ENG-1375 DoD: TestPagePermissionTab_RestrictAndGrantFlow", () => {
  let fakeEngine: ReturnType<typeof installFakeEngine>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fakeEngine = installFakeEngine();
  });

  test("restrict toggles and granted member row renders after add", async () => {
    renderTab();

    // Initial state: unrestricted, general-access box shows "Open".
    const generalAccessButton = await screen.findByRole("button", {
      name: /open/i,
    });

    // --- restrict toggle ---
    clickOpen(generalAccessButton);
    clickOpen(await screen.findByText("Restricted"));

    await waitFor(() => {
      expect(fakeEngine.post).toHaveBeenCalledWith(
        "/page-permissions/restrict",
        { pageId: PAGE_ID },
      );
    });
    expect(fakeEngine.isRestricted()).toBe(true);

    // AC5: restrict mutation invalidates `page-restriction-info`, the
    // Harness refetches it (real hook, mocked transport) and re-renders
    // PagePermissionTab restricted — the general-access box now reads
    // "Restricted" and the member-grant section becomes visible.
    await screen.findByText("Restricted");
    const memberSelectInput = await screen.findByPlaceholderText(
      "Search for users and groups",
    );

    // --- grant a member ---
    clickOpen(memberSelectInput);
    fireEvent.focus(memberSelectInput);
    clickOpen(await screen.findByText("Ada Lovelace"));

    const addButton = screen.getByRole("button", { name: "Add" });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(fakeEngine.post).toHaveBeenCalledWith(
        "/page-permissions/add-permission",
        expect.objectContaining({
          pageId: PAGE_ID,
          role: PagePermissionRole.WRITER,
          userId: "user-42",
        }),
      );
    });

    // The member picker's dropdown may still list "Ada Lovelace" as a
    // (re-searchable) option alongside her new permission row, so scope the
    // assertion to a match inside an actual `PagePermissionItem` row rather
    // than assuming a single match in the whole document.
    await waitFor(() => {
      const matches = screen.getAllByText("Ada Lovelace");
      const inPermissionRow = matches.some((el) =>
        el.closest('[class*="permissionItem"]'),
      );
      expect(inPermissionRow).toBe(true);
    });
  });

  test("AC7: an already-restricted, empty-permissions page never white-screens", async () => {
    renderTab();

    // Drive straight to the restricted state via the same real flow so the
    // "empty" (no permissions yet) branch of PagePermissionList renders.
    clickOpen(await screen.findByRole("button", { name: /open/i }));
    clickOpen(await screen.findByText("Restricted"));

    await waitFor(() => {
      expect(fakeEngine.isRestricted()).toBe(true);
    });

    // Never a blank screen: the restricted general-access state and the
    // member-grant affordance are both present.
    await screen.findByText("Restricted");
    await screen.findByPlaceholderText("Search for users and groups");
  });

  // review1 F1: AC5/AC6 previously only exercised the restrict direction —
  // `unrestrictPage`/`useUnrestrictPageMutation` and the reverse
  // general-access transition (restricted -> open) had shipped code but no
  // assertion. Drive the full round trip through the real hook + fake
  // transport (never mocking the hooks/services under test) and assert both
  // the wire call and the UI settling back to the unrestricted state.
  test("AC5/AC6: unrestrict reverts general access to Open and hides member management", async () => {
    renderTab();

    // Restrict first (same real flow as the DoD test above).
    clickOpen(await screen.findByRole("button", { name: /open/i }));
    clickOpen(await screen.findByText("Restricted"));
    await waitFor(() => {
      expect(fakeEngine.isRestricted()).toBe(true);
    });
    await screen.findByText("Restricted");
    await screen.findByPlaceholderText("Search for users and groups");

    // --- unrestrict toggle: reverse general-access direction ---
    clickOpen(screen.getByRole("button", { name: /restricted/i }));
    clickOpen(await screen.findByText("Open"));

    await waitFor(() => {
      expect(fakeEngine.post).toHaveBeenCalledWith(
        "/page-permissions/remove-restriction",
        { pageId: PAGE_ID },
      );
    });
    expect(fakeEngine.isRestricted()).toBe(false);

    // The tab re-renders unrestricted: general-access box reads "Open" again
    // and the member-grant affordance (only shown while restricted) is gone.
    await screen.findByRole("button", { name: /^open/i });
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Search for users and groups"),
      ).toBeNull();
    });
  });
});
