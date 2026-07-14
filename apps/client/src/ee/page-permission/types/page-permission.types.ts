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

export type IPageRestrictionInfo = {
  restrictionId?: string;
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom?: {
    id: string;
    slugId: string;
    title: string;
  };
  userAccess: {
    canView: boolean;
    canEdit: boolean;
    canManage: boolean;
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
