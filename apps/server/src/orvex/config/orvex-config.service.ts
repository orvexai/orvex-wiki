import { Injectable, Optional } from '@nestjs/common';

/**
 * OrvexConfigService — a REAL, pure environment reader for the additive orvex
 * surface.
 *
 * MINIMIZE-SURFACE (CS §3.6 / ❌#6, applied at foundation M8 review): this
 * service exposes ONLY the values that have a live consumer today —
 *   - gitSha / sourceRepo   -> OrvexSourceController (FR-W19 source offer)
 *   - identityUrl           -> SessionMintModule composition (RS256/JWKS)
 * The rest of the A-PORTABLE env surface (ORVEX_KNOWLEDGE/AI/BILLING/MCP/
 * CONSOLE/WIKI_API_URL, CELL_ID, CLUSTER_NAME, EVENT_TOPIC_SUFFIX) is already
 * deploy-documented in deploy/kustomize/app-manifests/configmap-env.yaml; each
 * getter is added HERE together with its first consumer at delivery — never
 * speculatively. (ORVEX_MODULES_ENABLED is read directly by
 * OrvexRootModule.register(), which runs before DI exists.)
 *
 * PURE: it reads only from an environment bag (defaults to `process.env`) and
 * holds no I/O, no network and no caching. A missing / blank optional value is
 * surfaced as `null`, NEVER as a fabricated placeholder. Tests construct it
 * with an explicit bag; Nest constructs it with `process.env` (the
 * `@Optional()` param resolves to `undefined`, so the default applies).
 */
@Injectable()
export class OrvexConfigService {
  private readonly env: NodeJS.ProcessEnv;

  constructor(@Optional() env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  /** Trim-and-nullify: undefined / blank -> null; otherwise the trimmed value. */
  private read(name: string): string | null {
    const raw = this.env[name];
    if (raw === undefined) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  /** ORVEX_IDENTITY_URL — the identity service (RS256/JWKS issuer) base URL. */
  get identityUrl(): string | null {
    return this.read('ORVEX_IDENTITY_URL');
  }

  /**
   * ORVEX_GIT_SHA — the exact commit the running binary was built from. Powers
   * the AGPL section 13 written-source offer (FR-W19). Null when unset (the
   * controller turns that into a LOUD 500) — never a fabricated SHA.
   */
  get gitSha(): string | null {
    return this.read('ORVEX_GIT_SHA');
  }

  /** ORVEX_SOURCE_REPO — the corresponding-source repository URL (AGPL section 13). */
  get sourceRepo(): string | null {
    return this.read('ORVEX_SOURCE_REPO');
  }
}
