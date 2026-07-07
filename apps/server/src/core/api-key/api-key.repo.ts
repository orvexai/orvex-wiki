import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { ApiKeyPublicView } from './dto/api-key.dto';

/**
 * ENG-1380 — clean-room AGPL api-key store (placement: core/api-key, see api-key.module.ts).
 *
 * One Kysely adapter (CS §3 one-adapter rule). `PUBLIC_COLUMNS` is the
 * single explicit column list every list/read path selects — `keyHash`
 * never appears in it (AC5, CWE-200). The hash is only ever touched by
 * {@link findAuthRecordById}, which is used exclusively at the auth seam
 * (never serialized to an HTTP response).
 */
const PUBLIC_COLUMNS = [
  'id',
  'name',
  'creatorId',
  'workspaceId',
  'expiresAt',
  'lastUsedAt',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;

export interface ApiKeyAuthRecord {
  id: string;
  keyHash: string | null;
  creatorId: string;
  workspaceId: string;
  deletedAt: Date | null;
  expiresAt: Date | null;
}

@Injectable()
export class ApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(
    insertable: {
      name: string;
      creatorId: string;
      workspaceId: string;
      expiresAt?: Date | null;
    },
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('apiKeys')
      .values({
        name: insertable.name,
        creatorId: insertable.creatorId,
        workspaceId: insertable.workspaceId,
        expiresAt: insertable.expiresAt ?? null,
      })
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  async setKeyHash(
    apiKeyId: string,
    keyHash: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('apiKeys')
      .set({ keyHash, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  /**
   * Auth-seam-only lookup — the ONE place `keyHash` is selected. Never
   * call this from a controller-facing list/read path.
   */
  async findAuthRecordById(
    apiKeyId: string,
    workspaceId: string,
  ): Promise<ApiKeyAuthRecord | undefined> {
    return this.db
      .selectFrom('apiKeys')
      .select([
        'id',
        'keyHash',
        'creatorId',
        'workspaceId',
        'deletedAt',
        'expiresAt',
      ])
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findPublicById(
    apiKeyId: string,
    workspaceId: string,
  ): Promise<ApiKeyPublicView | undefined> {
    return this.db
      .selectFrom('apiKeys')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async listPublic(
    workspaceId: string,
    opts: { creatorId?: string } = {},
  ): Promise<ApiKeyPublicView[]> {
    let query = this.db
      .selectFrom('apiKeys')
      .select(PUBLIC_COLUMNS)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc');

    if (opts.creatorId) {
      query = query.where('creatorId', '=', opts.creatorId);
    }

    return query.execute();
  }

  async updateName(
    apiKeyId: string,
    workspaceId: string,
    name: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('apiKeys')
      .set({ name, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirst();
  }

  async revoke(
    apiKeyId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirst();
  }

  async touchLastUsed(apiKeyId: string): Promise<void> {
    await this.db
      .updateTable('apiKeys')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }

  /**
   * ruling 7 — cross-DB delete reconcile. Idempotent: deleting for a
   * workspace with no remaining rows is a harmless no-op.
   */
  async hardDeleteAllForWorkspace(workspaceId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('apiKeys')
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }

  /** Orphan-sweep backstop: rows whose workspace no longer exists at all. */
  async sweepOrphans(): Promise<number> {
    const result = await this.db
      .deleteFrom('apiKeys')
      .where(({ selectFrom, not, exists }) =>
        not(
          exists(
            selectFrom('workspaces')
              .select('workspaces.id')
              .whereRef('workspaces.id', '=', 'apiKeys.workspaceId'),
          ),
        ),
      )
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
