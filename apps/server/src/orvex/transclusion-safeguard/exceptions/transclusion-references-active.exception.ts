// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ConflictException } from '@nestjs/common';
import { TransclusionImpactReport } from '../transclusion-safeguard.types';

/**
 * AC2 — thrown by `enforceOrUnsync` in `block` mode (the default) when
 * `activeReferenceCount > 0`. HTTP 409; body carries `errorCode` +
 * the full `impact` report, per the fork's
 * `exceptions/transclusion-references-active.exception.ts` L4-11.
 */
export class TransclusionReferencesActiveException extends ConflictException {
  constructor(impact: TransclusionImpactReport) {
    super({
      message:
        'Cannot complete this operation: other pages transclude live content from this page.',
      errorCode: 'TRANSCLUSION_REFERENCES_ACTIVE',
      impact,
    });
  }
}
