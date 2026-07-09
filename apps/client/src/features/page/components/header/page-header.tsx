import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import { Group } from "@mantine/core";
import { useParams } from "react-router-dom";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { PageStatusControl } from "@/features/page/components/page-status-control";

interface Props {
  readOnly?: boolean;
}
export default function PageHeader({ readOnly }: Props) {
  const { pageSlug } = useParams();
  // ENG-1440 (F1 fix) — reads the SAME cached page the rest of the page
  // shell already fetched (react-query dedups on `["pages", pageId]`); no
  // extra network call. Wires the status control into the running app.
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });

  return (
    <div className={classes.header} data-page-header="true">
      <Group justify="space-between" h="100%" px="md" wrap="nowrap" className={classes.group}>
        <Group wrap="nowrap" gap="var(--mantine-spacing-xs)" style={{ minWidth: 0 }}>
          <Breadcrumb />
          <PageStatusControl page={page} readOnly={readOnly} />
        </Group>

        <Group justify="flex-end" h="100%" px="md" wrap="nowrap" gap="var(--mantine-spacing-xs)">
          <PageHeaderMenu readOnly={readOnly} />
        </Group>
      </Group>
    </div>
  );
}
