// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { OrvexTransclusionImpactController } from './orvex-transclusion-impact.controller';
import { OrvexTransclusionSafeguardService } from './orvex-transclusion-safeguard.service';
import { TransclusionImpactReport } from './transclusion-safeguard.types';

/**
 * AC6 — the impact controller is a thin, read-only, guarded delegate:
 * it returns exactly `computeImpact`'s report and never calls
 * `enforceOrUnsync` (no mutation side effect).
 */
describe('OrvexTransclusionImpactController', () => {
  it('AC6: returns computeImpact output read-only and performs no mutation', async () => {
    const report: TransclusionImpactReport = {
      pageId: 'page-1',
      operation: 'delete',
      activeReferenceCount: 2,
      canForce: false,
      references: [],
    };
    const computeImpact = jest.fn().mockResolvedValue(report);
    const enforceOrUnsync = jest.fn();
    const service = {
      computeImpact,
      enforceOrUnsync,
    } as unknown as OrvexTransclusionSafeguardService;

    const controller = new OrvexTransclusionImpactController(service);

    const result = await controller.impact({
      pageId: 'page-1',
      operation: 'delete',
    });

    expect(result).toBe(report);
    expect(computeImpact).toHaveBeenCalledWith('page-1', 'delete');
    expect(enforceOrUnsync).not.toHaveBeenCalled();
  });
});
