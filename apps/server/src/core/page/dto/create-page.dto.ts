import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ENG-1397 AC6 — 'dfm' is a valid TS-level format (the DfM→ProseMirror
// resolution happens upstream, in the `dfm-contracts-ts-serializer` leg,
// blocked-by); it is intentionally NOT in the `@IsIn` validators below, so
// it can never be submitted over the public HTTP API yet. Reaching the
// `parseProsemirrorContent` chokepoint with `format: 'dfm'` un-resolved is a
// server-bug guard (`DFM_NOT_PRE_RESOLVED`), not a client-facing option.
export type ContentFormat = 'json' | 'markdown' | 'html' | 'dfm';

export class CreatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  content?: string | object;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase() ?? 'json')
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;

  // ENG-2484 (AC4) — the validated request-surface leg of the atomic
  // AI-provenance stamp. When true, the content write is tagged as
  // AI-authored: `PageService.updatePageContent` forwards it into the
  // collab `updatePageContent` Yjs event, whose handler marks the
  // AI-changed blocks in the live ydoc and flags the document so the next
  // debounced store stamps `orvex_page_meta` provenance in the SAME
  // transaction as the content write (ENG-1447/ENG-1603 mechanism).
  // Validated here (`@IsBoolean()`), never a bare untyped passthrough; the
  // acting identity is always the server-derived authenticated user, never
  // taken from the body.
  @IsOptional()
  @IsBoolean()
  markAiAuthored?: boolean;
}
