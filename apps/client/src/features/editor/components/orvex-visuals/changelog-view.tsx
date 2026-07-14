// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Stack, Text, Timeline } from "@mantine/core";
import { IconGitCommit } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPageChangelog } from "./orvex-visuals-service";

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * ENG-1377 (AC1, AC5, AC6, AC7) — ChangelogView renders a READ-ONLY
 * projection of the page's history + verified_against stamp, fetched from
 * the `pagevisuals-engine` `changelog` endpoint via
 * `orvex-visuals-service.ts`. It is NOT a hand- or AI-editable body block
 * (closes the P4 leak — CONTRACTS.md §2.10). `contentEditable={false}` on
 * the wrapper plus the underlying `atom`+`isolating` node schema
 * (`changelog.ts`) keep it out of the editable document (AC7). Never
 * white-screens: loading / empty / error all render an inline affordance
 * (AC6, CS §10).
 */
export default function ChangelogView(props: NodeViewProps) {
  const { editor } = props;
  const { t } = useTranslation();

  // pageId is stashed on editor storage by the page editor.
  const pageId: string | undefined = (editor.storage as any)?.pageId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["orvex-changelog", pageId],
    queryFn: () => getPageChangelog(pageId!),
    enabled: !!pageId,
  });

  if (isLoading) {
    return (
      <NodeViewWrapper data-drag-handle contentEditable={false}>
        <Text c="dimmed" size="sm" py="xs" data-testid="changelog-loading">
          {t("Loading changelog…")}
        </Text>
      </NodeViewWrapper>
    );
  }

  if (isError || !data) {
    return (
      <NodeViewWrapper data-drag-handle contentEditable={false}>
        <Text c="dimmed" size="sm" py="xs" data-testid="changelog-error">
          {t("Failed to load changelog")}
        </Text>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-drag-handle
      contentEditable={false}
      data-testid="changelog-nodeview"
    >
      <Stack gap={4} my="xs">
        <Group gap={8}>
          <Text fw={600} size="sm">
            {t("Changelog")}
          </Text>
          {data.verifiedAgainst && (
            <Text size="xs" c="dimmed" ff="monospace">
              {t("Verified against")} {data.verifiedAgainst.slice(0, 8)}
            </Text>
          )}
        </Group>

        {data.entries.length === 0 ? (
          <Text c="dimmed" size="sm" data-testid="changelog-empty">
            {t("No history yet")}
          </Text>
        ) : (
          <Timeline active={-1} bulletSize={18} lineWidth={2}>
            {data.entries.map((entry, index) => (
              <Timeline.Item
                key={`${entry.createdAt}-${index}`}
                bullet={<IconGitCommit size={12} />}
                title={
                  <Text size="sm">
                    {entry.version != null
                      ? `${t("Version")} ${entry.version}`
                      : entry.title || t("Revision")}
                  </Text>
                }
              >
                <Group gap={6}>
                  {entry.authorId && (
                    <Text size="xs" c="dimmed" data-testid="changelog-author">
                      {t("Author")} {entry.authorId}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    {formatDateTime(entry.createdAt)}
                  </Text>
                </Group>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Stack>
    </NodeViewWrapper>
  );
}
