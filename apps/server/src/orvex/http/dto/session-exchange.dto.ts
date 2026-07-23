// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsOptional, IsString } from 'class-validator';

/**
 * FR-W6 / ADR-0049 session-exchange request —
 * `#/components/schemas/SessionExchangeRequest`.
 *
 * `exchangeToken` is the identity-minted opaque token for the TRANSIENT
 * introspect path. It is OPTIONAL because the PREFERRED ADR-0049 S2S path
 * carries no body token — it presents an `X-Orvex-Assertion` header instead
 * (see {@link OrvexSessionExchangeController}). When present it must be a
 * string; the controller enforces that at least one credential (assertion or a
 * non-blank token) is supplied, denying with a 401 otherwise. `whitelist:true`
 * on the global pipe still strips any unknown body field.
 */
export class SessionExchangeRequestDto {
  @IsOptional()
  @IsString()
  exchangeToken?: string;
}
