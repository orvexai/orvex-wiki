import { Injectable, Logger, Optional } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import {
  OrvexMemberLookup,
  OrvexMemberRole,
} from '../../orvex/enforce-sso/orvex-enforce-sso-check.service';

/**
 * OrvexMemberLookup adapter — deliberately placed OUTSIDE `orvex/**` (AGPL
 * import-guard / A-BOUNDARY #4, canon P10: `orvex/**` never statically
 * imports `@docmost/*`). This file is the one, narrow bridge between the
 * portable enforce-SSO surface (`orvex/enforce-sso/*`, which only depends on
 * the `OrvexMemberLookup` interface it declares) and the engine's own
 * `UserRepo` — the same placement pattern already used for
 * `OrvexSsoEventsListener` (`./orvex-sso-events.listener.ts`), which needs
 * `UserSessionRepo` for the same reason.
 *
 * Delegates to the existing, already-indexed `UserRepo.findByEmail` (CS ❌#2:
 * no raw store driver outside the repo tier — this is a confined lookup
 * through the owned repo, not a bespoke Kysely query).
 *
 * `UserRepo` is injected via `@Optional()` (CS ❌#8 seam-decoupling): in the
 * real app `DatabaseModule` is `@Global()` and always resolvable; `@Optional()`
 * only matters for a graph that mounts the enforce-SSO module without the
 * database tier, where it degrades to a logged "no match" instead of a DI
 * resolution crash.
 */
@Injectable()
export class OrvexMemberLookupAdapter implements OrvexMemberLookup {
  private readonly logger = new Logger(OrvexMemberLookupAdapter.name);

  constructor(@Optional() private readonly userRepo?: UserRepo) {}

  async findMemberRole(
    workspaceId: string,
    email: string,
  ): Promise<OrvexMemberRole | undefined> {
    if (!this.userRepo) {
      this.logger.warn(
        'UserRepo unavailable — enforce-SSO member lookup cannot resolve a role; treating as no match.',
      );
      return undefined;
    }

    const user = await this.userRepo.findByEmail(email, workspaceId);
    if (!user) {
      return undefined;
    }
    return { id: user.id, role: user.role ?? 'member' };
  }
}
