// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Badge, Group, Text } from "@mantine/core";
import {
  IconCircleCheckFilled,
  IconClockExclamation,
  IconPencil,
  IconArchive,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  FreshnessTone,
  getPageFreshness,
} from "./orvex-visuals-service";

/** Mantine colour for each freshness tone. green / amber / grey. */
function toneColor(tone: FreshnessTone): string {
  switch (tone) {
    case "fresh":
      return "green";
    case "stale":
      return "yellow";
    case "draft":
      return "gray";
    case "archived":
      return "gray";
    default:
      return "gray";
  }
}

function toneIcon(tone: FreshnessTone) {
  switch (tone) {
    case "fresh":
      return <IconCircleCheckFilled size={14} />;
    case "stale":
      return <IconClockExclamation size={14} />;
    case "draft":
      return <IconPencil size={14} />;
    case "archived":
      return <IconArchive size={14} />;
    default:
      return null;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

/**
 * ENG-1377 (AC2, AC5, AC6, AC7) — FreshnessRibbonView renders the page's
 * freshness ribbon: status + last_reviewed_at + verified_against, coloured
 * green=canonical&fresh, amber=stale, grey=draft/archived. Data is
 * read-side from the page's native columns via the
 * `pagevisuals-engine` `freshness` endpoint (CONTRACTS.md §2.10 / P6).
 * Never white-screens: loading / empty / error all render an inline
 * affordance (never a thrown render — AC6, CS §10).
 */
export default function FreshnessRibbonView(props: NodeViewProps) {
  const { editor } = props;
  const { t } = useTranslation();

  // pageId is stashed on editor storage by the page editor.
  const pageId: string | undefined = (editor.storage as any)?.pageId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["orvex-freshness", pageId],
    queryFn: () => getPageFreshness(pageId!),
    enabled: !!pageId,
  });

  if (isLoading) {
    return (
      <NodeViewWrapper data-drag-handle contentEditable={false}>
        <Text
          c="dimmed"
          size="xs"
          py={2}
          data-testid="freshness-ribbon-loading"
        >
          {t("Loading freshness…")}
        </Text>
      </NodeViewWrapper>
    );
  }

  if (isError || !data) {
    return (
      <NodeViewWrapper data-drag-handle contentEditable={false}>
        <Text c="dimmed" size="xs" py={2} data-testid="freshness-ribbon-error">
          {t("Failed to load freshness")}
        </Text>
      </NodeViewWrapper>
    );
  }

  const reviewed = formatDate(data.lastReviewedAt);

  return (
    <NodeViewWrapper
      data-drag-handle
      contentEditable={false}
      data-testid="freshness-ribbon-nodeview"
    >
      <Group gap={8} my={4}>
        <Badge
          color={toneColor(data.tone)}
          variant="light"
          leftSection={toneIcon(data.tone)}
          size="sm"
          className={`orvex-freshness-tone-${data.tone}`}
          data-tone={data.tone}
        >
          {data.status}
        </Badge>

        {reviewed && (
          <Text size="xs" c="dimmed">
            {t("Reviewed")} {reviewed}
          </Text>
        )}

        {data.verifiedAgainst && (
          <Text size="xs" c="dimmed" ff="monospace">
            {t("Verified against")} {data.verifiedAgainst.slice(0, 8)}
          </Text>
        )}
      </Group>
    </NodeViewWrapper>
  );
}
