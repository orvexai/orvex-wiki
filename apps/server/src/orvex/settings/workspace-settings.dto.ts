// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

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
 * (Substantive exclusion, DTO-test-verified below. A literal, comment-blind
 * `git grep -iE 'Linear'` over this directory will still trip on THIS
 * scrub-explaining comment and the spec's own test titles/strings — ENG-1432
 * review #1, finding F3. The §5c CI gate must scope to declarations/exports
 * (as `workspace-settings.dto.spec.ts` does), not a bare directory-wide
 * text grep.)
 *
 * This DTO validates a PATCH (every field is optional at every level). The
 * separate, orthogonal `mergeWorkspaceSettings` helper (./merge-settings.ts)
 * is schema-agnostic and is available for use at the persistence path, but is
 * NOT YET the live persistence path (see merge-settings.ts doc-comment,
 * finding F1/F1c) — this class is a validation-tier gate only, never a
 * source of merge logic.
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
