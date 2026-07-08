import { ISpace } from "@/features/space/types/space.types.ts";

/**
 * ENG-1440 — client-local mirror of `@orvex/extensions`' `PageStatus`
 * enum values (CS §13 slim-AGPL: no workspace dep pulled in for a leaf
 * UI feature — the client never imports the engine's internal package,
 * only talks to it over `/api/orvex/pages/*`).
 */
export type PageStatusValue =
  | "draft"
  | "published"
  | "canonical"
  | "deprecated"
  | "superseded"
  | "archived";

export interface IPage {
  id: string;
  slugId: string;
  title: string;
  content: string;
  icon: string;
  coverPhoto: string;
  parentPageId: string;
  creatorId: string;
  spaceId: string;
  workspaceId: string;
  isLocked: boolean;
  isBase: boolean;
  lastUpdatedById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  position: string;
  hasChildren: boolean;
  canEdit?: boolean;
  creator: ICreator;
  lastUpdatedBy: ILastUpdatedBy;
  deletedBy: IDeletedBy;
  contributors?: IContributor[];
  space: Partial<ISpace>;
  permissions?: {
    canEdit: boolean;
    hasRestriction: boolean;
  };
  status?: PageStatusValue;
  supersedes?: string | null;
  supersededBy?: string | null;
  archiveReason?: string | null;
}

/** ENG-1440 — the lifecycle fields the `/api/orvex/pages/*` mutations
 * return (a subset of the engine's `OrvexPageMetaFields`). */
export interface IPageLifecycleMeta {
  status: PageStatusValue;
  supersedes: string | null;
  supersededBy: string | null;
  archiveReason: string | null;
  version: number;
}

export interface IContributor {
  id: string;
  name: string;
  avatarUrl: string;
}

interface ICreator {
  id: string;
  name: string;
  avatarUrl: string;
}
interface ILastUpdatedBy {
  id: string;
  name: string;
  avatarUrl: string;
}

interface IDeletedBy {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface IMovePage {
  pageId: string;
  position?: string;
  after?: string;
  before?: string;
  parentPageId?: string;
}

export interface IMovePageToSpace {
  pageId: string;
  spaceId: string;
}

export interface ICopyPageToSpace {
  pageId: string;
  spaceId?: string;
}

export interface SidebarPagesParams {
  spaceId?: string;
  pageId?: string;
  cursor?: string;
  limit?: number;
}

export interface IPageInput {
  pageId: string;
  title: string;
  parentPageId: string;
  icon: string;
  coverPhoto: string;
  position: string;
  isLocked: boolean;
}

export interface IExportPageParams {
  pageId: string;
  format: ExportFormat;
  includeChildren?: boolean;
  includeAttachments?: boolean;
}

export enum ExportFormat {
  HTML = "html",
  Markdown = "markdown",
  Docx = "docx",
}
