// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The greppable ALL-REAL sentinel (canon: no-op != mock).
 *
 * Its presence in a 501 response body is the PROOF that the surface is an honest
 * "not wired yet" stub rather than a fabricated / mock value. Every noop-501
 * orvex primitive carries it, and exactly one marker-comment line per handler
 * (see `scripts/orvex-marker-check.sh`) keeps the code<->contract set in lockstep.
 *
 * Contract: `NotImplementedError.marker` (a const) in `contracts/openapi.yaml`.
 */
export const ORVEX_NOT_IMPLEMENTED = 'ORVEX_NOT_IMPLEMENTED';

/**
 * The frozen-vocabulary-style code carried in every 501 sentinel body. Follows
 * the SCREAMING_SNAKE convention of the family error vocabulary.
 */
export const ORVEX_NOT_IMPLEMENTED_CODE = 'NOT_IMPLEMENTED';

/**
 * Typed body of the 501 sentinel — mirrors `#/components/schemas/NotImplementedError`
 * in `contracts/openapi.yaml` field-for-field (`code`, `operationId`, `marker`).
 */
export interface OrvexNotImplementedBody {
  readonly code: typeof ORVEX_NOT_IMPLEMENTED_CODE;
  readonly operationId: string;
  readonly marker: typeof ORVEX_NOT_IMPLEMENTED;
}

/**
 * The typed NotImplemented raised by every noop-501 orvex primitive.
 *
 * HTTP 501 with the greppable sentinel body `{ code, operationId, marker }`. It
 * is NEVER a plausible-looking value (no fabricated empty doc, no allowed:true
 * verdict, no zero-lag reading) — the `marker` is the honest proof. Because the
 * body is passed as an object, Nest returns it verbatim (it is not reshaped into
 * the framework `{statusCode,error,message}` envelope), so the wire shape matches
 * the contract exactly.
 */
export class OrvexNotImplementedException extends HttpException {
  constructor(operationId: string) {
    const body: OrvexNotImplementedBody = {
      code: ORVEX_NOT_IMPLEMENTED_CODE,
      operationId,
      marker: ORVEX_NOT_IMPLEMENTED,
    };
    super(body, HttpStatus.NOT_IMPLEMENTED);
  }
}
