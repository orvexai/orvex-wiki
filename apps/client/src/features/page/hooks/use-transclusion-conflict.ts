// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { useCallback } from "react";
import { useTransclusionConflictModal } from "@/features/page/components/transclusion-conflict-modal";

/**
 * ENG-1474 — port of the fork's `use-transclusion-conflict.ts`
 * (`extractTransclusionConflict` L11-36, `useTransclusionConflict` L59-105
 * @HEAD). A thin client projection over the engine's
 * `TRANSCLUSION_REFERENCES_ACTIVE` 409 contract (owned by the engine leg
 * `transclusion-engine` / ENG-1470) — no client-side conflict logic lives
 * here, only detection + retry wiring.
 */

export interface TransclusionReferenceInfo {
  referencePageId: string;
  referencePageTitle: string | null;
  referencePageSlugId: string;
  transclusionId: string;
}

export interface TransclusionImpactInfo {
  activeReferenceCount: number;
  references: TransclusionReferenceInfo[];
}

type MaybeConflictBody = {
  errorCode?: string;
  impact?: {
    activeReferenceCount?: unknown;
    references?: TransclusionReferenceInfo[];
  };
};

type MaybeAxiosError = {
  response?: {
    status?: number;
    data?: {
      errorCode?: string;
      impact?: MaybeConflictBody["impact"];
      message?: MaybeConflictBody;
    };
  };
};

/**
 * AC1 — recognises the 409 across both the nested (`data.message.impact`)
 * and flat (`data.impact`) body shapes; only a body whose `errorCode` is
 * `TRANSCLUSION_REFERENCES_ACTIVE` with a numeric `impact.activeReferenceCount`
 * counts as a transclusion conflict. Anything else — a non-409, a different
 * `errorCode`, or a malformed `impact` — returns `null`.
 */
export function extractTransclusionConflict(
  error: unknown,
): TransclusionImpactInfo | null {
  const err = error as MaybeAxiosError;
  if (err?.response?.status !== 409) {
    return null;
  }

  const data = err.response.data;
  const body: MaybeConflictBody | undefined = data?.errorCode
    ? data
    : data?.message;

  if (body?.errorCode !== "TRANSCLUSION_REFERENCES_ACTIVE") {
    return null;
  }

  if (typeof body.impact?.activeReferenceCount !== "number") {
    return null;
  }

  return {
    activeReferenceCount: body.impact.activeReferenceCount,
    references: body.impact.references ?? [],
  };
}

/**
 * Wraps a mutation so that a caught `TRANSCLUSION_REFERENCES_ACTIVE` 409
 * opens the confirm modal and, on confirm, retries the SAME mutation with
 * `onTransclusionConflict: 'unsync'` merged into the original payload
 * (AC2). Dismissing the modal resolves silently with no retry (AC4). Any
 * other error — non-409, or a 409 that is not a transclusion conflict — is
 * re-thrown to the caller unchanged; the modal never opens for it (AC3).
 */
export function useTransclusionConflict<
  TPayload extends Record<string, unknown>,
  TResult,
>(mutationFn: (payload: TPayload) => Promise<TResult>) {
  const { openConflictModal } = useTransclusionConflictModal();

  const execute = useCallback(
    (payload: TPayload): Promise<TResult | undefined> => {
      return mutationFn(payload).catch((err: unknown) => {
        const impact = extractTransclusionConflict(err);
        if (!impact) {
          throw err;
        }

        return new Promise<TResult | undefined>((resolve, reject) => {
          let settled = false;

          openConflictModal({
            impact,
            onConfirm: () => {
              settled = true;
              mutationFn({
                ...payload,
                onTransclusionConflict: "unsync",
              } as TPayload)
                .then(resolve)
                .catch(reject);
            },
            onClose: () => {
              if (settled) {
                return;
              }
              settled = true;
              resolve(undefined);
            },
          });
        });
      });
    },
    [mutationFn, openConflictModal],
  );

  return { execute } as const;
}
