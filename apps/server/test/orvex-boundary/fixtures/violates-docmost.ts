// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// ENG-2476 fixture — intentionally VIOLATES the AGPL import-guard
// (A-BOUNDARY / A-SEAMS): orvex/* and @orvex/* files never statically
// import @docmost/*. This file is a committed, fixed-string negative
// fixture consumed ONLY by
// orvex-module-boundary-import-guard.e2e-spec.ts's real programmatic
// ESLint run (synthetic apps/server/src/orvex/** filePath). It is NOT
// under apps/server/src/orvex/**, so it is never itself compiled, never
// imported by production or test code, and is invisible to the
// orvex/**-scoped ban when linted at its own committed path — the point
// of this fixture is to prove the ban fires when the SAME bytes are
// evaluated as if they lived inside the guarded tree, not to trip CI at
// this path.
import { UserRepo } from '@docmost/db/repos/user/user.repo';

export function violatesDocmostBoundary(repo: UserRepo): UserRepo {
  return repo;
}
