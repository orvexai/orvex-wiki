import * as crypto from 'crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User } from '@docmost/db/types/entity.types';
import { UserRole } from '../../common/helpers/types/permission';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import { TokenService } from '../../core/auth/services/token.service';
import { OrvexAuditService } from '../audit/orvex-audit.service';
import { ApiKeyRepo } from './api-key.repo';
import {
  ApiKeyPublicView,
  CreateApiKeyResponse,
} from './dto/api-key.dto';

export type TokenScope = 'full' | 'restricted';

export interface ApiKeyAuthResult {
  apiKeyId: string;
  creatorId: string;
  workspaceId: string;
}

/**
 * ENG-1380 — clean-room AGPL api-key domain service (placement: core/api-key, see api-key.module.ts).
 *
 * Independently authored from the behavioural contract in ENG-1380 §2 —
 * NOT copied from `apps/server/src/ee/api-key/**` (which does not exist in
 * this tree; see ENG-1381). Five methods, matching the deep-module
 * interface pinned in the ticket's §4e: create / update / revoke / list /
 * validate. The escalation guard (`assertMayManage`) is a domain invariant
 * enforced unconditionally, before any CASL/isOwner check ever runs
 * (AC4 — SE-Arch privilege-escalation lens).
 */
@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly tokenService: TokenService,
    private readonly orvexAudit: OrvexAuditService,
  ) {}

  /**
   * AC4 — enforced unconditionally, independent of admin role. A restricted
   * (read-only / space-scoped) token can NEVER manage api-keys, regardless
   * of who it was minted for.
   */
  private assertMayManage(tokenScope: TokenScope): void {
    if (tokenScope === 'restricted') {
      throw new ForbiddenException(
        'Restricted API tokens cannot manage workspace API keys.',
      );
    }
  }

  private hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async create(
    input: { name: string; expiresAt?: Date | null },
    ctx: { creator: User; workspaceId: string; tokenScope: TokenScope },
  ): Promise<CreateApiKeyResponse> {
    this.assertMayManage(ctx.tokenScope);

    return executeTx(this.db, async (trx) => {
      const inserted = await this.apiKeyRepo.insert(
        {
          name: input.name,
          creatorId: ctx.creator.id,
          workspaceId: ctx.workspaceId,
          expiresAt: input.expiresAt ?? null,
        },
        trx,
      );

      const token = await this.tokenService.generateApiToken({
        apiKeyId: inserted.id,
        user: ctx.creator,
        workspaceId: ctx.workspaceId,
        expiresIn: input.expiresAt
          ? Math.max(
              1,
              Math.floor((input.expiresAt.getTime() - Date.now()) / 1000),
            )
          : undefined,
      });

      const withHash = await this.apiKeyRepo.setKeyHash(
        inserted.id,
        this.hash(token),
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.API_KEY_CREATED,
        resourceType: AuditResource.API_KEY,
        resourceId: withHash.id,
        workspaceId: ctx.workspaceId,
        actorId: ctx.creator.id,
        actorType: 'user',
        metadata: { name: withHash.name },
      });

      return { apiKey: withHash, token };
    });
  }

  async update(
    input: { apiKeyId: string; name?: string },
    ctx: { actor: User; workspaceId: string; tokenScope: TokenScope },
  ): Promise<ApiKeyPublicView> {
    this.assertMayManage(ctx.tokenScope);

    const existing = await this.apiKeyRepo.findPublicById(
      input.apiKeyId,
      ctx.workspaceId,
    );
    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    // AC7 — a no-op name update emits NO audit event.
    if (input.name === undefined || input.name === existing.name) {
      return existing;
    }

    return executeTx(this.db, async (trx) => {
      const updated = await this.apiKeyRepo.updateName(
        input.apiKeyId,
        ctx.workspaceId,
        input.name,
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.API_KEY_UPDATED,
        resourceType: AuditResource.API_KEY,
        resourceId: updated.id,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.id,
        actorType: 'user',
        changes: { before: { name: existing.name }, after: { name: updated.name } },
      });

      return updated;
    });
  }

  async revoke(
    input: { apiKeyId: string },
    ctx: { actor: User; workspaceId: string; tokenScope: TokenScope },
  ): Promise<ApiKeyPublicView> {
    this.assertMayManage(ctx.tokenScope);

    const existing = await this.apiKeyRepo.findPublicById(
      input.apiKeyId,
      ctx.workspaceId,
    );
    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    const isAdminActingOnAnother =
      existing.creatorId !== ctx.actor.id &&
      (ctx.actor.role === UserRole.ADMIN || ctx.actor.role === UserRole.OWNER);

    if (existing.creatorId !== ctx.actor.id && !isAdminActingOnAnother) {
      throw new ForbiddenException('Cannot revoke another user\'s API key');
    }

    return executeTx(this.db, async (trx) => {
      const revoked = await this.apiKeyRepo.revoke(
        input.apiKeyId,
        ctx.workspaceId,
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.API_KEY_REVOKED,
        resourceType: AuditResource.API_KEY,
        resourceId: revoked.id,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.id,
        actorType: 'user',
        metadata: isAdminActingOnAnother
          ? { revokedByAdmin: true, originalOwnerId: existing.creatorId }
          : undefined,
      });

      return revoked;
    });
  }

  /**
   * Single list method (deep-module's 5-method interface). `isAdminView`
   * gates BOTH the escalation guard AND the caller-scoping: a non-admin
   * view is always scoped to `callerId`, an admin view sees the whole
   * workspace and additionally requires the caller to hold admin/owner role
   * (AC8 — `AUTH_FAILED` fire-and-forget on denial, never blocking the 403).
   */
  async list(criteria: {
    workspaceId: string;
    caller: User;
    tokenScope: TokenScope;
    isAdminView: boolean;
  }): Promise<ApiKeyPublicView[]> {
    if (criteria.isAdminView) {
      this.assertMayManage(criteria.tokenScope);

      const isAdmin =
        criteria.caller.role === UserRole.ADMIN ||
        criteria.caller.role === UserRole.OWNER;

      if (!isAdmin) {
        this.orvexAudit.logFireAndForget({
          event: AuditEvent.AUTH_FAILED,
          resourceType: AuditResource.API_KEY,
          workspaceId: criteria.workspaceId,
          actorId: criteria.caller.id,
          actorType: 'user',
          metadata: { reason: 'admin_role_required' },
        });
        throw new ForbiddenException('Admin role required');
      }

      return this.apiKeyRepo.listPublic(criteria.workspaceId);
    }

    return this.apiKeyRepo.listPublic(criteria.workspaceId, {
      creatorId: criteria.caller.id,
    });
  }

  /**
   * The auth-seam validator (AC1/AC2/AC3, AC9's downstream data source).
   * Fail-closed on every branch — never bypasses on an unexpected shape.
   * Does NOT resolve `user`/`workspace` itself (that stays in
   * `JwtStrategy`, which already owns those repos) — this returns only the
   * data needed to do so, keeping the interface to 5 methods.
   */
  async validate(
    payload: { apiKeyId: string; workspaceId: string },
    rawToken: string | undefined,
  ): Promise<ApiKeyAuthResult> {
    if (!rawToken) {
      throw new UnauthorizedException('API key hash mismatch');
    }

    const record = await this.apiKeyRepo.findAuthRecordById(
      payload.apiKeyId,
      payload.workspaceId,
    );

    if (!record) {
      throw new UnauthorizedException('API key revoked');
    }

    if (record.deletedAt) {
      throw new UnauthorizedException('API key revoked');
    }

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('API key revoked');
    }

    if (!record.keyHash) {
      // Fail-closed: a legacy row minted before key_hash existed can never
      // authenticate again — it must be re-issued (AC2).
      throw new UnauthorizedException('API key must be re-issued');
    }

    const presentedHash = this.hash(rawToken);
    const storedHashBuf = Buffer.from(record.keyHash, 'hex');
    const presentedHashBuf = Buffer.from(presentedHash, 'hex');

    const matches =
      storedHashBuf.length === presentedHashBuf.length &&
      crypto.timingSafeEqual(storedHashBuf, presentedHashBuf);

    if (!matches) {
      throw new UnauthorizedException('API key hash mismatch');
    }

    // Best-effort, never blocks auth on failure.
    this.apiKeyRepo.touchLastUsed(record.id).catch(() => undefined);

    return {
      apiKeyId: record.id,
      creatorId: record.creatorId,
      workspaceId: record.workspaceId,
    };
  }
}
