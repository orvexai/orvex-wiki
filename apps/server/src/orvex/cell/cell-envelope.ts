import { Injectable } from '@nestjs/common';
import { OrvexConfigService } from '../config/orvex-config.service';

/**
 * CloudEvent envelope shape the engine produces onto the studio-spine.
 *
 * A-CELL rule #6/#2 + A-SEAMS: because the engine is the ONLY AGPL artifact and
 * the shared envelope helper lives in orvex-studio-contracts (Apache-2.0), the
 * engine does NOT import that helper across the AGPL boundary — it ships this
 * OWN small TypeScript envelope builder that conforms to the frozen wire-names
 * (`cell` / `cell_epoch` + the `orvexcell` extension attribute), proven against
 * the contracts GOLDEN FIXTURES rather than by code-sharing.
 */
export interface OrvexCloudEvent<T = unknown> {
  /** CloudEvents 1.0 core. */
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  time: string;
  datacontenttype: 'application/json';
  data: T;

  // ── Cell contract extension attributes (frozen wire names) ──────────────
  /** `orvexcell` extension = CELL_ID; consumers fail closed on a mismatch. */
  orvexcell: string;
  cell: string;
  cell_epoch: number;

  /** Per-tenant ordering key on the Kafka partition (FR-W5). */
  partitionkey: string;
  /** Threaded from ingress for correlation (A-OBSERVE F11). */
  correlationid?: string;
}

@Injectable()
export class CellEnvelopeBuilder {
  constructor(private readonly config: OrvexConfigService) {}

  /**
   * Wrap a domain payload in the frozen CloudEvent envelope.
   * SCAFFOLD: `id` uses a placeholder; the real build uses a UUIDv7 and pulls
   * `cell_epoch` from the cell configuration.
   */
  build<T>(params: {
    type: string;
    source: string;
    workspaceId: string;
    data: T;
    correlationId?: string;
  }): OrvexCloudEvent<T> {
    return {
      specversion: '1.0',
      id: '00000000-0000-0000-0000-000000000000', // TODO(fold-in): UUIDv7
      source: params.source,
      type: params.type,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: params.data,
      orvexcell: this.config.cellId,
      cell: this.config.cellId,
      cell_epoch: 0, // TODO(fold-in): read cell_epoch from cell config
      partitionkey: params.workspaceId,
      correlationid: params.correlationId,
    };
  }

  /**
   * Topic name for a domain (A-CELL rule #5): `{domain}-events.{suffix}`,
   * single-partition, asserted at boot. The internal cell id (or crew suffix)
   * names the topic — never the short public token.
   */
  topicFor(domain: string): string {
    return `${domain}-events.${this.config.eventTopicSuffix}`;
  }
}
