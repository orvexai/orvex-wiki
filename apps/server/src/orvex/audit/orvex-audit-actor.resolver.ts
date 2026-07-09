import { Injectable } from '@nestjs/common';

/**
 * ENG-1396 (AC6) — actor resolver: classifies the caller of a mutation as
 * either an `external_agent` (an API-key-authenticated request) or a
 * human `user`, threading the API-key UUID as `clientId` for the former.
 *
 * Pure, DI'd, no I/O (CS §6 — resolver is pure; store access stays
 * confined to `OrvexAuditService`).
 *
 * The fork source this leg ports from (`orvex-audit-actor.resolver.ts`
 * L25-52) reads `req.raw.authMethod`/`req.raw.apiKeyId` (a Fastify-raw
 * convention). This repo's own auth seam (`JwtStrategy`,
 * `AuthMethod` param decorator) instead threads `authMethod`/`apiKeyId`
 * directly on the resolved `request.user` object — so `resolve` accepts
 * that same request-shaped `{ authMethod, apiKeyId }` pair (adapted,
 * not literal req.raw, per the Dev-Context note that file paths/shapes
 * there are an informational forecast, not a declared contract).
 */
export interface OrvexResolvedAuditActor {
  actorType: 'external_agent' | 'user';
  actorId: string | null;
  clientId: string | null;
}

export interface OrvexAuditActorUser {
  id?: string | null;
}

export interface OrvexAuditActorRequest {
  authMethod?: 'api_key' | undefined;
  apiKeyId?: string | null;
}

@Injectable()
export class OrvexAuditActorResolver {
  resolve(
    user: OrvexAuditActorUser | undefined | null,
    req: OrvexAuditActorRequest | undefined | null,
  ): OrvexResolvedAuditActor {
    if (req?.authMethod === 'api_key') {
      return {
        actorType: 'external_agent',
        actorId: user?.id ?? null,
        clientId: req?.apiKeyId ?? null,
      };
    }
    return {
      actorType: 'user',
      actorId: user?.id ?? null,
      clientId: null,
    };
  }
}
