import { Injectable } from '@nestjs/common';

/**
 * OrvexConfigService — the product-family-agnostic endpoint seam (A-PORTABLE)
 * plus the day-1 cell contract (A-CELL).
 *
 * Every platform dependency the engine reaches is a CONFIGURED URL
 * (`ORVEX_<SVC>_URL`), never a hard-coded Studio host — so a standalone or
 * embedded-elsewhere wiki points these at its own instances, and a `crew/{name}`
 * stack resolves its siblings to their crew hosts (crew → crew). Reads the
 * environment only; empty string = not configured (degrade cleanly).
 *
 * The vanilla v0.95 engine ignores all of these; the additive orvex/* modules
 * consume them when `ORVEX_MODULES_ENABLED=true`.
 */
@Injectable()
export class OrvexConfigService {
  /** Sentinel cell for dev/crew/standalone — cell enforcement no-ops. */
  get cellId(): string {
    return process.env.CELL_ID || 'solo';
  }

  /** Distinct from CELL_ID (a cell runs on exactly one cluster at a time). */
  get clusterName(): string {
    return process.env.CLUSTER_NAME || '';
  }

  /**
   * Kafka topic suffix for `{domain}-events.{suffix}` (A-CELL rule #5).
   * Defaults to the cell id; a crew overlay sets it to `crew-{name}` so a
   * crew's spine is its own.
   */
  get eventTopicSuffix(): string {
    return process.env.EVENT_TOPIC_SUFFIX || this.cellId;
  }

  /** True only when a real cell is configured; the `solo` sentinel no-ops. */
  get cellEnforced(): boolean {
    return this.cellId !== 'solo';
  }

  // ── Sibling endpoint seam (ORVEX_<SVC>_URL) ─────────────────────────────
  get identityUrl(): string {
    return process.env.ORVEX_IDENTITY_URL || '';
  }

  get knowledgeUrl(): string {
    return process.env.ORVEX_KNOWLEDGE_URL || '';
  }

  get aiUrl(): string {
    return process.env.ORVEX_AI_URL || '';
  }

  get billingUrl(): string {
    return process.env.ORVEX_BILLING_URL || '';
  }

  get mcpUrl(): string {
    return process.env.ORVEX_MCP_URL || '';
  }

  get consoleUrl(): string {
    return process.env.ORVEX_CONSOLE_URL || '';
  }

  get wikiApiUrl(): string {
    return process.env.ORVEX_WIKI_API_URL || '';
  }

  /** §13 AGPL source-offer values (FR-W19). */
  get gitSha(): string {
    return process.env.ORVEX_GIT_SHA || '';
  }

  get sourceRepo(): string {
    return process.env.ORVEX_SOURCE_REPO || '';
  }
}
