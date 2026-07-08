// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsNotEmpty, IsString } from 'class-validator';

/**
 * FR-W6 session-exchange request — `#/components/schemas/SessionExchangeRequest`.
 *
 * Only the one contract field: the identity-minted RS256 exchange token to
 * consume. The token is verified by the built+tested M7 core once the A-THIN
 * session fold-in lands; the endpoint is 501 today.
 */
export class SessionExchangeRequestDto {
  @IsString()
  @IsNotEmpty()
  exchangeToken!: string;
}
