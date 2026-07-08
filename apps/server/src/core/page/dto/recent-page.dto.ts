import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RecentPageDto {
  @IsOptional()
  @IsString()
  spaceId: string;

  /** ENG-1434 AC11 — opt-in reveal of superseded pages (excluded by default). */
  @IsOptional()
  @IsBoolean()
  includeSuperseded?: boolean;
}
