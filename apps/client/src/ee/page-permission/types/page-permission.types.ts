export enum PagePermissionRole {
  READER = "reader",
  WRITER = "writer",
}

// ENG-1375 fix pass 1: singular principal per call — matches the shipped
// `AddPagePermissionDto`/`RemovePagePermissionDto` (apps/server/src/core/
// permissions/dto/page-permission.dto.ts), which take exactly one of
// `userId`/`groupId` and reject arrays. Multi-select grants issue one
// request per selected principal (see `handleAddMembers`).
export type IAddPagePermission = {
  pageId: string;
  role: PagePermissionRole;
  userId?: string;
  groupId?: string;
};

export type IRemovePagePermission = {
  pageId: string;
  userId?: string;
  groupId?: string;
};

export type IUpdatePagePermissionRole = {
  pageId: string;
  role: PagePermissionRole;
  userId?: string;
  groupId?: string;
};

// Mirror of the engine's `RestrictionInfo` return shape
// (apps/server/src/core/permissions/page-permission.service.ts,
// `getRestrictionInfo` — shipped by ENG-1596). `inheritedFrom` is the
// restricted ancestor's page id (resolved to a title/slug client-side via
// `/pages/info` when a link is rendered), never a pre-joined page object.
export type IPageRestrictionInfo = {
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom: string | null;
  userAccess: {
    canAccess: boolean;
    canEdit: boolean;
  };
};

type IPagePermissionBase = {
  id: string;
  name: string;
  role: string;
  createdAt: string;
};

export type IPagePermissionUser = IPagePermissionBase & {
  type: "user";
  email: string;
  avatarUrl: string | null;
};

export type IPagePermissionGroup = IPagePermissionBase & {
  type: "group";
  memberCount: number;
  isDefault: boolean;
};

export type IPagePermissionMember = IPagePermissionUser | IPagePermissionGroup;
