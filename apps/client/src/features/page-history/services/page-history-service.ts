import api from "@/lib/api-client";
import { IPageHistory } from "@/features/page-history/types/page.types";
import { IPagination } from "@/lib/types.ts";

export async function getPageHistoryList(
  pageId: string,
  cursor?: string,
): Promise<IPagination<IPageHistory>> {
  const req = await api.post("/pages/history", {
    pageId,
    cursor,
  });
  return req.data;
}

export async function getPageHistoryById(
  historyId: string,
): Promise<IPageHistory> {
  const req = await api.post<IPageHistory>("/pages/history/info", {
    historyId,
  });
  return req.data;
}

// ENG-1369 (AC6): server-side restore-from-history. pageId is required so
// the server can guard a historyId that belongs to a different
// page/workspace (INVALID_PAGE_HISTORY_REF).
export async function restorePageFromHistory(
  pageId: string,
  historyId: string,
): Promise<IPageHistory> {
  const req = await api.post<IPageHistory>("/pages/history/restore", {
    pageId,
    historyId,
  });
  return req.data;
}
