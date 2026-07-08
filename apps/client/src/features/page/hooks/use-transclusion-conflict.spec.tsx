// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi } from "vitest";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { ReactNode } from "react";
import {
  extractTransclusionConflict,
  useTransclusionConflict,
} from "@/features/page/hooks/use-transclusion-conflict";

const i18n = createInstance();
i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <I18nextProvider i18n={i18n}>
        <ModalsProvider>{children}</ModalsProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}

function makeConflictError(shape: "nested" | "flat", activeReferenceCount = 2) {
  const impact = {
    activeReferenceCount,
    references: Array.from({ length: activeReferenceCount }, (_, i) => ({
      referencePageId: `page-${i}`,
      referencePageTitle: i === 0 ? `Page ${i}` : null,
      referencePageSlugId: `slug-${i}`,
      transclusionId: `tx-${i}`,
    })),
  };
  const body = { errorCode: "TRANSCLUSION_REFERENCES_ACTIVE", impact };
  const data = shape === "nested" ? { message: body } : body;
  return { response: { status: 409, data } };
}

describe("TransclusionConflictRetrySpec (named DoD test)", () => {
  // AC1
  test("extractTransclusionConflict parses nested and flat 409 bodies, rejects non-match and non-409", () => {
    expect(
      extractTransclusionConflict(makeConflictError("nested")),
    ).toEqual({
      activeReferenceCount: 2,
      references: expect.any(Array),
    });
    expect(extractTransclusionConflict(makeConflictError("flat"))).toEqual({
      activeReferenceCount: 2,
      references: expect.any(Array),
    });
    expect(
      extractTransclusionConflict({
        response: { status: 409, data: { errorCode: "SOMETHING_ELSE" } },
      }),
    ).toBeNull();
    expect(
      extractTransclusionConflict({ response: { status: 500, data: {} } }),
    ).toBeNull();
    expect(extractTransclusionConflict(new Error("boom"))).toBeNull();
  });

  // AC2 + AC4
  test("confirm retries mutationFn with onTransclusionConflict:'unsync' merged; dismiss resolves without retry", async () => {
    const conflictError = makeConflictError("flat", 1);
    const mutationFn = vi
      .fn()
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce("retried-ok");

    const { result } = renderHook(
      () => useTransclusionConflict(mutationFn),
      { wrapper },
    );

    let executePromise: Promise<unknown>;
    act(() => {
      executePromise = result.current.execute({ pageId: "p1" });
    });

    await waitFor(() => {
      expect(screen.getByText("Unsync All and Continue")).toBeTruthy();
    });

    act(() => {
      screen.getByText("Unsync All and Continue").click();
    });

    await expect(executePromise!).resolves.toBe("retried-ok");
    expect(mutationFn).toHaveBeenCalledTimes(2);
    expect(mutationFn).toHaveBeenNthCalledWith(2, {
      pageId: "p1",
      onTransclusionConflict: "unsync",
    });
  });

  test("dismissing the modal resolves silently with no retry", async () => {
    const conflictError = makeConflictError("flat", 1);
    const mutationFn = vi.fn().mockRejectedValueOnce(conflictError);

    const { result } = renderHook(
      () => useTransclusionConflict(mutationFn),
      { wrapper },
    );

    let executePromise: Promise<unknown>;
    act(() => {
      executePromise = result.current.execute({ pageId: "p1" });
    });

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeTruthy();
    });

    act(() => {
      screen.getByText("Cancel").click();
    });

    await expect(executePromise!).resolves.toBeUndefined();
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  // AC3
  test("a non-transclusion error is re-thrown unchanged and no modal opens", async () => {
    const originalError = new Error("network down");
    const mutationFn = vi.fn().mockRejectedValueOnce(originalError);

    const { result } = renderHook(
      () => useTransclusionConflict(mutationFn),
      { wrapper },
    );

    await expect(result.current.execute({ pageId: "p1" })).rejects.toBe(
      originalError,
    );
    expect(screen.queryByText("Unsync All and Continue")).toBeNull();
  });
});

