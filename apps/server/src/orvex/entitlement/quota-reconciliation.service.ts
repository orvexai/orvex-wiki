// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { QuotaFastCounter } from './quota-fast-counter';
import { QuotaResource } from './entitlement.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { UserRepo } from '../../database/repos/user/user.repo';

/**
 * Sweep cadence (ms). Heavier than `OutboxRelayService`'s 2s poll (this
 * sweep diffs counters against store-tier aggregates), so it runs an order
 * of magnitude less often — a scheduling knob, not a correctness bound (the
 * counter TTL is the passive worst-case staleness bound either way).
 */
const SWEEP_INTERVAL_MS = 30_000;

export interface SweepResult {
  /** Live counters examined this run (the SCAN-discovered candidate set). */
  candidates: number;
  /** Counters actually CORRECTED this run — the AC1 O(changed) invariant. */
  tenantsTouched: number;
}

/**
 * ENG-2492 AC1 — the O(changed) counter-reconciliation sweep: corrects
 * drifted `quota:{resource}:{tenant}` fast-counters from store-tier truth.
 *
 * O(changed), never O(N-tenants): the candidate set is the LIVE counter
 * keys discovered from Redis (a bounded SCAN — tenants with no counter are
 * never visited, so a full per-tenant store re-scan never happens), and a
 * WRITE is issued only for the k candidates whose counter actually
 * disagrees with truth — `tenantsTouched` reports exactly k.
 *
 * Tier discipline: control-flow only. Every truth read goes through the
 * owning repo (`PageRepo`/`AttachmentRepo`/`UserRepo` — CS §6 store
 * confinement, ❌#2); the fail-open/fail-closed ENFORCEMENT decision lives
 * exclusively in `EntitlementService` (❌#1) — this sweep only repairs
 * counters AFTER an outage, it never decides a verdict.
 *
 * Multi-replica safety (same idiom as `OutboxRelayService.poll`, this
 * repo's one Deployment / `replicas: 2` topology): the correction is a
 * race-tolerant absolute SET from truth — two replicas sweeping
 * concurrently both write the same truth value, so no hard singleton is
 * needed; the in-process `sweeping` latch only stops one replica's ticks
 * from piling up behind a slow pass.
 */
@Injectable()
export class QuotaReconciliationService {
  private readonly logger = new Logger(QuotaReconciliationService.name);
  private sweeping = false;

  constructor(
    private readonly fastCounter: QuotaFastCounter,
    private readonly pageRepo: PageRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly userRepo: UserRepo,
  ) {}

  /** Runs off the hot path — a slow/failing pass never blocks a live write. */
  @Interval('orvex-quota-reconciliation', SWEEP_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const result = await this.runSweepOnce();
      if (result.tenantsTouched > 0) {
        this.logger.log(
          `Quota reconciliation corrected ${result.tenantsTouched} drifted counter(s) of ${result.candidates} candidate(s)`,
        );
      }
    } catch (err) {
      this.logger.error(`Quota reconciliation sweep failed: ${err}`);
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * One full sweep pass. Exposed for direct invocation (tests, an operator
   * runbook) — the `@Interval` tick above is only the scheduler.
   */
  async runSweepOnce(): Promise<SweepResult> {
    const counters = await this.fastCounter.listCounters();
    let tenantsTouched = 0;

    for (const counter of counters) {
      const truth = await this.truthFor(counter.tenantId, counter.resource);
      if (truth === null) {
        continue; // no store-tier aggregate owns this resource dimension
      }
      if (truth !== counter.value) {
        // Absolute correction from truth (a seed, refreshing the TTL) —
        // never an arithmetic patch on the drifted value.
        await this.fastCounter.seed(counter.tenantId, counter.resource, truth);
        tenantsTouched += 1;
      }
    }

    return { candidates: counters.length, tenantsTouched };
  }

  /**
   * The store-tier truth for one (tenant, resource) pair — via the OWNING
   * repo's existing aggregate, never an ad-hoc query in this service (❌#2).
   * `file_bytes` is a per-file bound with no running aggregate → `null`
   * (nothing to reconcile).
   */
  private async truthFor(
    workspaceId: string,
    resource: QuotaResource,
  ): Promise<number | null> {
    switch (resource) {
      case 'pages':
        return this.pageRepo.countByWorkspaceId(workspaceId);
      case 'files':
        return this.attachmentRepo.countByWorkspaceId(workspaceId);
      case 'storage':
        return this.attachmentRepo.sumFileSizeByWorkspaceId(workspaceId);
      case 'members':
        return this.userRepo.countByWorkspaceId(workspaceId);
      case 'file_bytes':
        return null;
    }
  }
}
