// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// ENG-2476 fixture — intentionally VIOLATES the AGPL import-guard
// (A-BOUNDARY): orvex/* and @orvex/* files never statically import
// **/ee/**. The only sanctioned ee reference in this repo is the
// try/catch dynamic require() in app.module.ts (a require() call, which
// the static-import rule deliberately does not match). This file is a
// committed, fixed-string negative fixture consumed ONLY by
// orvex-module-boundary-import-guard.e2e-spec.ts's real programmatic
// ESLint run (synthetic apps/server/src/orvex/** filePath). It is NOT
// under apps/server/src/orvex/**, so it is never itself compiled, never
// imported by production or test code.
import { EeModule } from '../ee/ee.module';

export const violatesEeBoundary = EeModule;
