import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { IsTtlDaysOrNever } from './is-ttl-days-or-never.validator';

/**
 * OrvexWorkspaceSettings — the typed, validated shape of `workspaces.settings`
 * (jsonb). Ported from the fork at pin `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`packages/orvex-extensions/src/settings/workspace-settings.dto.ts#L16-L198`).
 *
 * LINEAR SCRUB (binding, ENG-1432 §1/§5c): at the pin this DTO also declared
 * `LinearSettings` + `LinearOauthClientSettings` and an `OrvexWorkspaceSettings
 * .linear?: LinearSettings` field. Linear is a WHOLESALE orvex-wiki exclusion
 * (plan.json: linear-integration-server + 4 siblings, D-S11 REMOVE) — those two
 * classes and the `linear?` field are DROPPED, not ported. No `Linear*` symbol
 * is exported from this module and no `linear` key exists on this schema.
 *
 * This DTO validates a PATCH (every field is optional at every level) — the
 * separate, orthogonal `mergeWorkspaceSettings` helper (./merge-settings.ts)
 * is schema-agnostic and is the actual persistence path; this class is a
 * validation-tier gate only, never a source of merge logic.
 */

export class OrvexAiSettings {
  @IsOptional()
  @IsBoolean()
  chat?: boolean;

  @IsOptional()
  @IsBoolean()
  search?: boolean;

  @IsOptional()
  @IsString({ each: true })
  models?: string[];

  @IsOptional()
  @IsTtlDaysOrNever()
  chatHistoryTtlDays?: 'never' | number;
}

export class OrvexMcpSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class OrvexOidcSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false })
  issuerUrl?: string;

  @IsOptional()
  @IsBoolean()
  enforceSso?: boolean;
}

export class OrvexRatifyGateSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class OrvexThrottleSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class OrvexWorkspaceSettings {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrvexAiSettings)
  ai?: OrvexAiSettings;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrvexMcpSettings)
  mcp?: OrvexMcpSettings;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrvexOidcSettings)
  oidc?: OrvexOidcSettings;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrvexRatifyGateSettings)
  ratifyGate?: OrvexRatifyGateSettings;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrvexThrottleSettings)
  throttle?: OrvexThrottleSettings;
}
