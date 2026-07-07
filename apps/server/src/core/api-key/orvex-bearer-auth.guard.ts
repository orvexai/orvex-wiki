import { Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * ENG-1380 — AC9. The single bearer-auth seam for the api-key surface.
 *
 * There is exactly one passport `'jwt'` strategy in this engine
 * ({@link JwtStrategy}), which already dispatches BOTH `type=access`
 * (session) and `type=api_key` principals through one `validate()` — so
 * `OrvexBearerAuthGuard` is a thin, explicitly-named subclass of the
 * shared {@link JwtAuthGuard} rather than a second competing auth stack
 * (CS §3 one-adapter rule: one JWT verify adapter). Naming it distinctly
 * documents, at the call site, that this route accepts api-key bearers —
 * the actual `type=api_key` acceptance + `authMethod`/`apiKeyId` threading
 * lives in `JwtStrategy.validateApiKey` (backed by {@link ApiKeyService}),
 * which a `type=session` request never touches.
 */
@Injectable()
export class OrvexBearerAuthGuard extends JwtAuthGuard {}
