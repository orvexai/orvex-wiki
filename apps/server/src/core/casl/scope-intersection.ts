import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import {
  ISpaceAbility,
  SpaceCaslAction,
  SpaceCaslSubject,
} from './interfaces/space-ability.type';

/**
 * ENG-1454 — C3 keystone: the scope-carry-at-auth symbol.
 *
 * Callers MUST NOT inspect `TOKEN_SCOPE_SYMBOL` outside of this module —
 * it is a `unique symbol`, not a string key, precisely so no callsite can
 * accidentally (or deliberately) read/forge it via `user['orvexTokenScope']`
 * bracket access. The ONLY writer is {@link stampTokenScope}, invoked at
 * the auth seam (`JwtStrategy` / the `@AuthUser` decorator carry-through);
 * the ONLY reader is {@link intersectWithTokenScope}, below.
 */
export const TOKEN_SCOPE_SYMBOL: unique symbol = Symbol('orvexTokenScope');

/**
 * The token's own grant, as verified/threaded by the auth seam. This
 * engine never MINTS a `TokenScopeGrant` — that is `identity`'s leg
 * (`scoped-tokens-identity-mint`); the engine only carries + enforces
 * whatever the verified token already claims.
 *
 *  - `readOnly: true`  → the effective ability can never exceed `Read`.
 *  - `spaceIds: null`  → no space restriction (every space the creator
 *    ability already reaches remains reachable).
 *  - `spaceIds: []`    → an EXPLICIT empty scope — AC7, "the intersection
 *    of nothing is nothing": no space is reachable.
 *  - `spaceIds: [...]` → an explicit allowlist; retrieval MUST intersect
 *    (AC5 — only listed spaces are reachable).
 */
export interface TokenScopeGrant {
  readOnly: boolean;
  spaceIds: string[] | null;
}

export interface ScopeCarryingUser {
  [TOKEN_SCOPE_SYMBOL]?: TokenScopeGrant;
}

/**
 * Stamps the verified token scope onto the resolved user at the auth seam
 * (AC2 — "scope-carry-at-auth"). Absent/`undefined` grant means the
 * request carries no token-scope claim at all (a session/JWT user, or a
 * legacy unscoped API key) — {@link intersectWithTokenScope} treats that
 * as fully unrestricted (AC7).
 */
export function stampTokenScope<T extends object>(
  user: T,
  grant: TokenScopeGrant | undefined,
): T & ScopeCarryingUser {
  const carrier = user as T & ScopeCarryingUser;
  if (grant !== undefined) {
    carrier[TOKEN_SCOPE_SYMBOL] = grant;
  }
  return carrier;
}

function emptyAbility(): MongoAbility<ISpaceAbility> {
  const { build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  return build();
}

/**
 * Rebuilds `ability` keeping only what it could already `Read` (a `Manage`
 * rule implies `Read`, so it downgrades too) — never a rule the creator
 * ability didn't already grant, and never anything above `Read` (AC1/AC4).
 */
function downgradeToReadOnly(
  ability: MongoAbility<ISpaceAbility>,
): MongoAbility<ISpaceAbility> {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  for (const subject of Object.values(SpaceCaslSubject)) {
    if (
      ability.can(SpaceCaslAction.Read, subject) ||
      ability.can(SpaceCaslAction.Manage, subject)
    ) {
      can(SpaceCaslAction.Read, subject);
    }
  }
  return build();
}

/**
 * C3 — the central scope-intersection guard: `effective = creatorAbility ∩
 * tokenScope`. This is the ONLY place `TOKEN_SCOPE_SYMBOL` is ever read.
 *
 * Monotone floor (Security, primary NFR): the result can never grant more
 * than `ability` already grants, and never more than the token's own
 * scope allows — never a union, never wider (AC1).
 *
 * @param ability the creator's already-computed ability for `spaceId`
 *   (from `SpaceAbilityFactory.createForUser`).
 * @param spaceId the space this request is scoped to.
 * @param user the resolved user, possibly carrying a `TOKEN_SCOPE_SYMBOL`
 *   grant stamped by {@link stampTokenScope} at the auth seam.
 */
export function intersectWithTokenScope<T extends object>(
  ability: MongoAbility<ISpaceAbility>,
  spaceId: string,
  user: T,
): MongoAbility<ISpaceAbility> {
  const grant = (user as ScopeCarryingUser)?.[TOKEN_SCOPE_SYMBOL];

  // AC7 — absent symbol: session user / legacy unscoped key. Unrestricted.
  if (grant === undefined) {
    return ability;
  }

  // AC7 — an EXPLICIT empty allowlist means nothing is reachable at all,
  // regardless of `spaceId`: the intersection of nothing is nothing.
  if (grant.spaceIds !== null && grant.spaceIds.length === 0) {
    return emptyAbility();
  }

  // AC5 — an explicit per-space allowlist; retrieval MUST intersect.
  if (grant.spaceIds !== null && !grant.spaceIds.includes(spaceId)) {
    return emptyAbility();
  }

  // AC1/AC4 — read-only mode never exceeds Read, however wide the
  // creator's own ability is.
  if (grant.readOnly) {
    return downgradeToReadOnly(ability);
  }

  return ability;
}
