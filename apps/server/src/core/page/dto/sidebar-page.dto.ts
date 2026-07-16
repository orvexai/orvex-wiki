import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Coerces an empty-string field to `undefined` so `@IsOptional()` genuinely
 * skips it. class-validator's `@IsOptional()` only bypasses the remaining
 * validators for `null`/`undefined` — NOT for `''` — so an empty string still
 * runs `@IsUUID()` and 400s.
 *
 * Tree-nav 502 root-cause (amazing-MCP engine leg): wiki-api's
 * `GET /v1/wiki/{loc}/tree` composes over this primitive
 * (`POST /api/pages/sidebar-pages`) by listing a page's CHILDREN — it threads
 * the page id as `pageId` and, having no space in hand, sends `spaceId: ""`.
 * That empty string tripped `@IsUUID()` here → 400, which wiki-api's read
 * ladder surfaces to the caller as a bare 502. `/v1/list/wiki` (real
 * `space_id`) and `backlinks`/`breadcrumbs` (no spaceId at all) were fine —
 * only the empty-string path broke, confirming the cause. Normalizing `''` →
 * `undefined` lets `getSidebarPages` take its documented `dto.pageId` branch
 * (derive the space from the page) exactly as the sidebar UI does.
 */
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class SidebarPageDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  pageId: string;

  /** ENG-1434 AC11 — opt-in reveal of superseded pages (excluded by default). */
  @IsOptional()
  @IsBoolean()
  includeSuperseded?: boolean;
}
