// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// AC4 — health/budget banner: amber alert on litellmDown/hardCap/soft-cap,
// nothing when nominal (or when the health endpoint itself errors).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";

const postMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import AiStatusBanner from "../ai-status-banner";
import litellmDownFixture from "../../__tests__/fixtures/ai-health.litellm-down.json";
import nominalFixture from "../../__tests__/fixtures/ai-health.nominal.json";

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <AiStatusBanner />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("AiStatusBanner", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("shows the amber alert when litellmDown is true", async () => {
    postMock.mockResolvedValue({ data: litellmDownFixture });
    renderBanner();
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
  });

  it("renders nothing when health is nominal", async () => {
    postMock.mockResolvedValue({ data: nominalFixture });
    renderBanner();
    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when the health endpoint itself errors", async () => {
    postMock.mockRejectedValue(new Error("network error"));
    renderBanner();
    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
