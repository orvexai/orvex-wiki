// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsBoolean } from 'class-validator';

/** ENG-1434 AC5 — `POST /api/orvex/settings/force-supersede` body. */
export class UpdateForceSupersedeDto {
  @IsBoolean()
  enabled: boolean;
}
