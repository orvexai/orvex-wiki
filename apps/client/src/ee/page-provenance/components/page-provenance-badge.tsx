import { Badge, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePageProvenanceQuery } from "@/ee/page-provenance/queries/page-provenance-query";
import {
  getProvenanceColor,
  getProvenanceLabel,
} from "@/ee/page-provenance/components/provenance-status";
import classes from "@/ee/page-provenance/styles/provenance.module.css";

interface PageProvenanceBadgeProps {
  pageId: string | undefined;
}

/**
 * ENG-1460 AC3/AC4/AC5 — page-provenance badge.
 *
 * A pure projection of the engine's provenance state (no client-side
 * provenance logic): maps the queried status straight to a label via
 * `getProvenanceLabel`. Distinct component + query from the QMS
 * page-verification badge (AC4) — never shares that surface.
 *
 * States (AC5): loading -> render nothing (no-flash placeholder, avoids a
 * badge popping in); null/absent -> no badge; query error -> the query
 * hook folds this into `null` already, so it also renders no badge here
 * (never a thrown render).
 */
export function PageProvenanceBadge({ pageId }: PageProvenanceBadgeProps) {
  const { t } = useTranslation();
  const { data: status, isLoading } = usePageProvenanceQuery(pageId);

  if (isLoading) {
    return null;
  }

  const label = getProvenanceLabel(status ?? null, t);
  if (!label) {
    return null;
  }

  return (
    <Tooltip label={label} withArrow>
      <Badge
        data-testid="page-provenance-badge"
        aria-label={label}
        className={classes.badge}
        variant="light"
        color={getProvenanceColor(status ?? null)}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
