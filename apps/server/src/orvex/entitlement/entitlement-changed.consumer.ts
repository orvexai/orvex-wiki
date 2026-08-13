// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { CELL_SOLO, OrvexConfigService } from '../config/orvex-config.service';
import { ENTITLEMENT_CACHE, EntitlementCache } from './entitlement-cache';
import { Principal, PrincipalType } from './entitlement.types';

/**
 * The CloudEvents `type` this consumer subscribes to — billing's
 * entitlement-changed notification (ADR-0004's PUSH half of the dual
 * PULL+PUSH entitlement-read transport; ADR-0007 envelope).
 */
export const BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE =
  'billing.entitlement.changed';

const VALID_PRINCIPAL_TYPES: readonly PrincipalType[] = ['user', 'org'];

/**
 * ENG-2489 AC2 — the `billing.entitlement.changed` CloudEvent consumer:
 * the previously-"deferred" PUSH half of the entitlement read seam (see
 * the header comment history in `entitlement-cache.ts`).
 *
 * The event is ONLY an eviction TRIGGER, never a source of VALUE (AC4's
 * "never trusts the event's payload as the value, only evicts" rule —
 * SE-Arch security lens): this consumer reads exactly the typed
 * principal-identifying fields it needs to compute the cache key for
 * `EntitlementCache.evict`, and deliberately ignores every other payload
 * field. A forged/malformed event can therefore at worst cause one extra
 * authenticated billing-port re-read — never inject a fabricated
 * entitlement.
 *
 * Transport: this repo's studio-spine Kafka leg (`kafkajs`, the same
 * pinned client `KafkaPublisherAdapter` already uses — one client library,
 * no bespoke wiring). Subscription is config-gated: it starts only when
 * BOTH `KAFKA_BROKERS` and `ORVEX_BILLING_EVENTS_TOPIC` are configured;
 * otherwise the consumer stays dormant (the PULL path self-heals within
 * the cache TTL — bounded staleness, per the dual-transport design). A
 * broker outage never crashes boot: subscription failures are logged and
 * the PULL/TTL path remains the worst-case freshness bound.
 *
 * Fleet C-cell (AD-4/AD-13): before any eviction, `assertEventCell` checks
 * the envelope's `orvexcell` extension against this deployment's own
 * `CELL_ID` — an absent or foreign cell claim is dropped, never dispatched.
 * No-op under the `solo` sentinel / unconfigured `CELL_ID`.
 */
@Injectable()
export class EntitlementChangedConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EntitlementChangedConsumer.name);
  private consumer: Consumer | null = null;

  constructor(
    @Inject(ENTITLEMENT_CACHE)
    private readonly cache: EntitlementCache,
    @Optional() private readonly environmentService?: EnvironmentService,
    @Optional() private readonly orvexConfig?: OrvexConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.environmentService?.getKafkaBrokers?.() ?? [];
    const topic = this.orvexConfig?.billingEventsTopic ?? null;
    if (brokers.length === 0 || topic === null) {
      this.logger.debug(
        'EntitlementChangedConsumer dormant — KAFKA_BROKERS and/or ORVEX_BILLING_EVENTS_TOPIC not configured; entitlement freshness degrades to the cache-TTL bound (PULL self-heals).',
      );
      return;
    }

    try {
      const kafka = new Kafka({
        clientId: 'orvex-wiki-entitlement-evict',
        brokers,
      });
      this.consumer = kafka.consumer({
        groupId: 'orvex-wiki-entitlement-evict',
      });
      await this.consumer.connect();
      await this.consumer.subscribe({ topic });
      await this.consumer.run({
        eachMessage: async ({ message }) => {
          const raw = message.value?.toString();
          if (!raw) {
            return;
          }
          await this.handleRawMessage(raw);
        },
      });
      this.logger.log(
        `EntitlementChangedConsumer subscribed to ${topic} for ${BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE}`,
      );
    } catch (err) {
      // Never crash boot on a broker problem — bounded staleness (the
      // cache TTL) is the designed degrade mode when the PUSH leg is down.
      this.logger.error(
        `EntitlementChangedConsumer subscription failed (degrading to TTL-bound freshness): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch (err) {
        this.logger.warn(
          `EntitlementChangedConsumer disconnect failed: ${(err as Error).message}`,
        );
      }
      this.consumer = null;
    }
  }

  /**
   * The wire entry point: one serialized CloudEvent envelope (the Kafka
   * message value). Parses, then delegates to {@link handleCloudEvent}.
   * A malformed payload is logged and dropped — never a crash, never an
   * eviction on garbage.
   */
  async handleRawMessage(raw: string): Promise<boolean> {
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      this.logger.warn(
        'EntitlementChangedConsumer dropped a non-JSON message (not a CloudEvent envelope)',
      );
      return false;
    }
    return this.handleCloudEvent(envelope);
  }

  /**
   * Handles one parsed CloudEvent envelope. Returns true iff the event was
   * a well-formed `billing.entitlement.changed`, carried a usable `orvexcell`
   * extension for this deployment, and an eviction was issued. The ONLY
   * fields read are `type`, `orvexcell`, and the principal-identifying pair —
   * the event payload's entitlement VALUE fields are never trusted (❌#12:
   * typed narrowing, no `any`-laundered value ever leaves this method).
   */
  async handleCloudEvent(envelope: unknown): Promise<boolean> {
    if (typeof envelope !== 'object' || envelope === null) {
      return false;
    }
    const type = (envelope as { type?: unknown }).type;
    if (type !== BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE) {
      return false;
    }

    if (!this.assertEventCell(envelope)) {
      return false;
    }

    const principal = this.extractPrincipal(
      (envelope as { data?: unknown }).data,
    );
    if (!principal) {
      this.logger.warn(
        `EntitlementChangedConsumer dropped a ${BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE} event without a valid principal — no eviction issued`,
      );
      return false;
    }

    await this.cache.evict(principal);
    this.logger.debug(
      `Evicted cached entitlement for ${principal.principal_type}/${principal.principal_id} on ${BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE}`,
    );
    return true;
  }

  /**
   * Fleet C-cell (AD-4/AD-13, cell-contract rule #6 — event-consumer half):
   * the envelope's `orvexcell` extension (the field name `OutboxRelayService`
   * stamps on the wiki.* publish side — the same producer this billing.*
   * consumer's sibling API-BFF consumer checks, `orvex-studio-api`'s
   * `entitlement.ts`) must equal THIS deployment's own `CELL_ID`. An absent,
   * empty, or foreign `orvexcell` is DROPPED before any eviction is issued —
   * never dispatched to the handler on trust. No-op under the `solo`
   * sentinel or an unconfigured `CELL_ID` (mirrors
   * `DomainMiddleware.cellEnforcementActive()` — enforcement is off entirely
   * in dev/crew/self-hosted, matching every other cell check in this repo).
   */
  private assertEventCell(envelope: object): boolean {
    const podCellId = this.orvexConfig?.cellId ?? null;
    if (podCellId === null || podCellId === CELL_SOLO) {
      return true;
    }
    const eventCell = (envelope as { orvexcell?: unknown }).orvexcell;
    if (typeof eventCell !== 'string' || eventCell.trim() === '' || eventCell !== podCellId) {
      this.logger.warn(
        `EntitlementChangedConsumer dropped a ${BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE} event: orvexcell mismatch (eventCell=${JSON.stringify(eventCell ?? null)} podCellId=${podCellId})`,
      );
      return false;
    }
    return true;
  }

  /**
   * Typed extraction of the principal-identifying fields, accepting the
   * flat (`data.principal_type`/`data.principal_id`) and nested
   * (`data.principal.{principal_type,principal_id}`) envelope shapes.
   */
  private extractPrincipal(data: unknown): Principal | null {
    if (typeof data !== 'object' || data === null) {
      return null;
    }
    const nested = (data as { principal?: unknown }).principal;
    const source =
      typeof nested === 'object' && nested !== null ? nested : data;

    const principalType = (source as { principal_type?: unknown })
      .principal_type;
    const principalId = (source as { principal_id?: unknown }).principal_id;

    if (
      typeof principalType !== 'string' ||
      !VALID_PRINCIPAL_TYPES.includes(principalType as PrincipalType) ||
      typeof principalId !== 'string' ||
      principalId.length === 0
    ) {
      return null;
    }

    return {
      principal_type: principalType as PrincipalType,
      principal_id: principalId,
    };
  }
}
