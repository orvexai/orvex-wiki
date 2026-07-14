// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { useState } from "react";
import { Alert, Anchor, Button, Text } from "@mantine/core";
import { IconArchive, IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { PageStatusValue } from "@/features/page/types/page.types";
import { useUnsupersedePageMutation } from "@/features/page/queries/page-query";
import {
  buildArchivedReasonSuffix,
  buildPageLink,
  shouldShowUnarchive,
} from "./superseded-banner.utils";

export interface SupersededBannerPage {
  id: string;
  status?: PageStatusValue;
  supersededBy?: string | null;
  archiveReason?: string | null;
}

export interface SupersededBannerProps {
  page?: SupersededBannerPage | null;
  readOnly?: boolean;
}

/**
 * ENG-1440 (AC4, AC5, AC8) — the superseded/archived lifecycle banner.
 * Never white-screens on a rejected unarchive mutation: the error renders
 * inline and the banner (and page) stay mounted (CS §10).
 */
export function SupersededBanner({ page, readOnly }: SupersededBannerProps) {
  const { t } = useTranslation("orvex");
  const unsupersedeMutation = useUnsupersedePageMutation();
  const [error, setError] = useState<string | null>(null);

  if (!page?.status) {
    return null;
  }

  if (page.status === "superseded" && page.supersededBy) {
    const href = buildPageLink(page.supersededBy);
    return (
      <Alert
        data-testid="superseded-banner"
        color="yellow"
        icon={<IconExternalLink size={16} />}
      >
        {t("This page has been superseded by")}{" "}
        <Anchor href={href} data-testid="superseded-banner-link">
          {t("the canonical page")}
        </Anchor>
      </Alert>
    );
  }

  if (page.status === "archived") {
    const showUnarchive = shouldShowUnarchive(page.status, readOnly);
    const reasonSuffix = buildArchivedReasonSuffix(page.archiveReason);

    return (
      <Alert
        data-testid="archived-banner"
        color="gray"
        icon={<IconArchive size={16} />}
      >
        {t("This page is archived")}
        {reasonSuffix}
        {showUnarchive && (
          <Button
            data-testid="unarchive-button"
            size="xs"
            ml="sm"
            variant="light"
            loading={unsupersedeMutation.isPending}
            onClick={() => {
              setError(null);
              unsupersedeMutation.mutate(
                { pageId: page.id },
                {
                  onError: (err) => {
                    const message =
                      (err as { response?: { data?: { message?: string } } })
                        .response?.data?.message ||
                      t("Failed to unarchive page");
                    setError(message);
                  },
                },
              );
            }}
          >
            {t("Unarchive")}
          </Button>
        )}
        {error && (
          <Text
            data-testid="unarchive-inline-error"
            c="red"
            size="sm"
            mt="xs"
          >
            {error}
          </Text>
        )}
      </Alert>
    );
  }

  return null;
}
