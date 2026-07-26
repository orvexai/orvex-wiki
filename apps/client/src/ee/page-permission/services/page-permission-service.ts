import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  IAddPagePermission,
  IPagePermissionMember,
  IPageRestrictionInfo,
  IRemovePagePermission,
  IUpdatePagePermissionRole,
} from "@/ee/page-permission/types/page-permission.types";

// ENG-1375: repointed to the real `page-permissions` engine controller
// (`apps/server/src/core/permissions/page-permission.controller.ts`,
// `@Controller('page-permissions')`, shipped by ENG-1373; the `list` and
// `restriction-info` reads shipped by ENG-1596). All 7 routes below exist
// server-side today. Both reads are gated by the same `assertCanManage`
// choke point as the mutations — a non-space-admin caller gets 403, which
// the share modal renders as its locked state.
export async function restrictPage(pageId: string): Promise<void> {
  await api.post("/page-permissions/restrict", { pageId });
}

export async function addPagePermission(
  data: IAddPagePermission,
): Promise<void> {
  await api.post("/page-permissions/add-permission", data);
}

export async function removePagePermission(
  data: IRemovePagePermission,
): Promise<void> {
  await api.post("/page-permissions/remove-permission", data);
}

export async function updatePagePermissionRole(
  data: IUpdatePagePermissionRole,
): Promise<void> {
  await api.post("/page-permissions/update-permission", data);
}

export async function unrestrictPage(pageId: string): Promise<void> {
  await api.post("/page-permissions/remove-restriction", { pageId });
}

export async function getPagePermissions(
  pageId: string,
  cursor?: string,
): Promise<IPagination<IPagePermissionMember>> {
  const req = await api.post<IPagination<IPagePermissionMember>>(
    "/page-permissions/list",
    { pageId, ...(cursor && { cursor }) },
  );
  return req.data;
}

export async function getPageRestrictionInfo(
  pageId: string,
): Promise<IPageRestrictionInfo> {
  const req = await api.post<IPageRestrictionInfo>(
    "/page-permissions/restriction-info",
    { pageId },
  );
  return req.data;
}
