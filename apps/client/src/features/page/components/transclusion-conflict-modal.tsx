// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { useCallback } from "react";
import { modals } from "@mantine/modals";
import { Anchor, List, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { TransclusionImpactInfo } from "@/features/page/hooks/use-transclusion-conflict";

/**
 * ENG-1474 — port of the fork's `transclusion-conflict-modal.tsx`
 * (`useTransclusionConflictModal`, L35-89 @HEAD). Pure presentational leaf:
 * renders the engine-supplied `impact` and reports confirm/close back to the
 * caller (`useTransclusionConflict`) — no client-side conflict logic.
 */
const MAX_SHOWN = 10;

export type OpenTransclusionConflictModalProps = {
  impact: TransclusionImpactInfo;
  onConfirm: () => void;
  onClose: () => void;
};

export function useTransclusionConflictModal() {
  const { t } = useTranslation();

  const openConflictModal = useCallback(
    ({ impact, onConfirm, onClose }: OpenTransclusionConflictModalProps) => {
      const shown = impact.references.slice(0, MAX_SHOWN);
      const extra = impact.activeReferenceCount - shown.length;

      modals.openConfirmModal({
        title: t("This page is embedded elsewhere"),
        centered: true,
        children: (
          <Stack gap="xs">
            <Text size="sm">
              {t(
                "This page is embedded live in {{count}} page(s). Continuing will unsync those pages to static snapshots.",
                { count: impact.activeReferenceCount },
              )}
            </Text>
            <List size="sm">
              {shown.map((reference) => (
                <List.Item key={reference.transclusionId}>
                  <Anchor href={`/p/${reference.referencePageSlugId}`}>
                    {reference.referencePageTitle ||
                      reference.referencePageSlugId}
                  </Anchor>
                </List.Item>
              ))}
            </List>
            {extra > 0 && (
              <Text size="sm" c="dimmed">
                {t("…and {{extra}} more", { extra })}
              </Text>
            )}
          </Stack>
        ),
        labels: {
          confirm: t("Unsync All and Continue"),
          cancel: t("Cancel"),
        },
        confirmProps: { color: "orange" },
        onConfirm,
        onClose,
      });
    },
    [t],
  );

  return { openConflictModal } as const;
}
