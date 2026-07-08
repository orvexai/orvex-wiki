import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";

/**
 * ENG-1460 fix pass 1 (review finding F1) — `FullEditorProvenanceWiringSpec`.
 *
 * The named DoD test (`ai-provenance-client-surface.spec.tsx`) proves
 * `PageProvenanceBadge` renders correctly in isolation, but nothing proved
 * it is actually mounted anywhere a user can see it — an orphan-UI defect.
 * This test locks the composition: `PageByline` (the byline row `FullEditor`
 * renders next to the QMS `PageVerificationBadge`) must mount
 * `PageProvenanceBadge` and pass it the page's id.
 *
 * CS §5 mocking rule: `PageProvenanceBadge` and the QMS `PageVerificationBadge`
 * are each already covered by their own real-editor/real-query test suites
 * (`ai-provenance-client-surface.spec.tsx`, the page-verification suites) —
 * re-exercising their internals here would just duplicate those tests. This
 * spec is about composition/wiring only, so it is legitimate to stub both
 * sibling badges with sentinels and assert the wiring, not their behavior.
 */
vi.mock("@/ee/page-provenance/components/page-provenance-badge", () => ({
  PageProvenanceBadge: (props: { pageId: string | undefined }) => (
    <div data-testid="stub-provenance-badge" data-page-id={props.pageId ?? ""} />
  ),
}));

vi.mock("@/ee/page-verification", () => ({
  PageVerificationBadge: () => <div data-testid="stub-verification-badge" />,
}));

import { PageByline } from "@/features/editor/full-editor";

describe("FullEditorProvenanceWiringSpec", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("mounts PageProvenanceBadge next to the QMS PageVerificationBadge, wired to the page id", () => {
    render(
      <MemoryRouter>
        <MantineProvider>
          <PageByline
            pageId="page-42"
            creator={{ id: "u1", name: "Ada", avatarUrl: "" }}
            contributors={[]}
            readOnly={false}
          />
        </MantineProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("stub-verification-badge")).toBeTruthy();
    const provenanceBadge = screen.getByTestId("stub-provenance-badge");
    expect(provenanceBadge).toBeTruthy();
    expect(provenanceBadge.getAttribute("data-page-id")).toBe("page-42");
  });
});
