import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class SidebarPageDto {
  @IsOptional()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  pageId: string;

  /** ENG-1434 AC11 — opt-in reveal of superseded pages (excluded by default). */
  @IsOptional()
  @IsBoolean()
  includeSuperseded?: boolean;
}
