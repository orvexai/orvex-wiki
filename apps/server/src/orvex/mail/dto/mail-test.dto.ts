// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsEmail, IsNotEmpty } from 'class-validator';

/** Body for `POST /api/integrations/mail/test` (AC6/AC7). */
export class MailTestDto {
  @IsNotEmpty()
  @IsEmail()
  recipient: string;
}
