// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// ENG-2476 fixture — negative control. Imports ONLY @orvex/dfm (the
// AGPL clean-room DfM twin, sanctioned for orvex/* to import — A-SEAMS)
// and @nestjs/common (a plain third-party package, never quarantined).
// Consumed by orvex-module-boundary-import-guard.e2e-spec.ts to prove the
// orvex/** boundary ban does NOT false-positive on a genuinely clean
// import set. Not under apps/server/src/orvex/**, so never itself
// compiled or imported by production code.
import { Injectable } from '@nestjs/common';
import { pmToDfm } from '@orvex/dfm';

@Injectable()
export class CleanOrvexImportFixture {
  describe(): string {
    return typeof pmToDfm;
  }
}
