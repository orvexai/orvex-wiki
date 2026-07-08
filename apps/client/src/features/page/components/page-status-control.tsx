// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Badge, Menu, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageStatusValue } from "@/features/page/types/page.types";
import { getAssignableStatuses } from "./page-status-control.utils";
import { useSetPageStatusMutation } from "@/features/page/queries/page-query";

export interface PageStatusControlPage {
  id?: string;
  status?: PageStatusValue;
}

export interface PageStatusControlProps {
  page?: PageStatusControlPage | null;
  /** No edit permission — display-only, no dropdown trigger (AC2). */
  readOnly?: boolean;
}

const STATUS_COLOR: Record<PageStatusValue, string> = {
  draft: "gray",
  published: "blue",
  canonical: "green",
  deprecated: "orange",
  superseded: "yellow",
  archived: "dark",
};

/**
 * ENG-1440 (AC1, AC2, AC10) — thin presentational status badge + assignable
 * status dropdown. All lifecycle decisions (which transitions are legal)
 * are server-owned; this component only renders `page.status` and issues
 * `useSetPageStatusMutation` for whatever the user picks from
 * `getAssignableStatuses`.
 */
export function PageStatusControl({ page, readOnly }: PageStatusControlProps) {
  const { t } = useTranslation("orvex");
  const setStatusMutation = useSetPageStatusMutation();

  // AC10 — no page id/status yet (query still loading) => render nothing,
  // never a flicker of a wrong status.
  if (!page?.id || !page.status) {
    return null;
  }

  const badge = (
    <Badge
      data-testid="page-status-badge"
      color={STATUS_COLOR[page.status]}
      variant="light"
    >
      {t(`pageStatus.${page.status}`, { defaultValue: page.status })}
    </Badge>
  );

  // AC2 — read-only variant: badge only, no menu trigger.
  if (readOnly) {
    return badge;
  }

  const assignable = getAssignableStatuses(page.status);
  const pageId = page.id;

  return (
    <Menu shadow="md" position="bottom-start" transitionProps={{ duration: 0 }}>
      <Menu.Target>
        <UnstyledButton data-testid="page-status-trigger">
          {badge}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {assignable.map((status) => (
          <Menu.Item
            key={status}
            onClick={() => setStatusMutation.mutate({ pageId, status })}
          >
            {t(`pageStatus.${status}`, { defaultValue: status })}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
