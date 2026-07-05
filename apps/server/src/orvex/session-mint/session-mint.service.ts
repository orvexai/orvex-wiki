import { Injectable, Logger } from '@nestjs/common';

/**
 * SessionMintService — the engine's SOLE in-process auth code (FR-W6 / A-AUTH):
 * consume an identity-minted exchange token and mint the engine's session
 * cookie (the `createSessionAndToken` seam).
 *
 * The engine must ACCEPT identity-minted tokens (RS256/JWKS or introspection),
 * replacing the symmetric `APP_SECRET` `jwt.verify` on every request. Native
 * email/password login is removed fully — NO break-glass (D-S3); a standalone
 * wiki BUNDLES identity rather than reviving a native path. SSO-enforcement +
 * session-revocation stay engine-side.
 *
 * SCAFFOLD: the consume/verify bodies are TODO. `ORVEX_IDENTITY_URL` (JWKS) is
 * read via OrvexConfigService when wired.
 */
@Injectable()
export class SessionMintService {
  private readonly logger = new Logger(SessionMintService.name);

  /**
   * Verify an identity exchange token (RS256/JWKS against ORVEX_IDENTITY_URL)
   * and return the principal to mint a session for.
   */
  async consumeExchangeToken(_exchangeToken: string): Promise<null> {
    // TODO(fold-in WS-6): verify RS256/JWKS (or introspection), assert cell,
    // then hand off to the engine's session mint.
    this.logger.debug('consumeExchangeToken() is a scaffold no-op');
    return null;
  }
}
