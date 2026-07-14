// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { useAtom } from "jotai";
import { useParams } from "react-router-dom";
import { Group, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { showSupersededAtom } from "@/features/page/atoms/show-superseded-atom";

/**
 * ENG-1440 (AC6, AC7) — the sidebar's per-space "show superseded" toggle.
 * Reads/writes `showSupersededAtom` for the CURRENT route's space only;
 * the actual sidebar-query status-filter wiring (`toSidebarStatusFilter`)
 * is consumed by the sidebar query layer, not this control.
 */
export function ShowSupersededToggle() {
  const { t } = useTranslation("orvex");
  const { spaceSlug } = useParams();
  const [showSuperseded, setShowSuperseded] = useAtom(
    showSupersededAtom(spaceSlug),
  );

  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm">{t("Show superseded pages")}</Text>
      <Switch
        data-testid="show-superseded-toggle"
        checked={showSuperseded}
        onChange={(event) => setShowSuperseded(event.currentTarget.checked)}
      />
    </Group>
  );
}
