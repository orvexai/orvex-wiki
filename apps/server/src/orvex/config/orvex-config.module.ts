// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';

import { OrvexConfigService } from './orvex-config.service';

/**
 * Provides the pure {@link OrvexConfigService} env reader to the orvex tree.
 * Exported so the http controllers module (and any future orvex module) can
 * inject it without re-declaring the provider.
 */
@Module({
  providers: [OrvexConfigService],
  exports: [OrvexConfigService],
})
export class OrvexConfigModule {}
