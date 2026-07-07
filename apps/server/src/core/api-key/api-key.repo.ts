import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import type { Json } from '@docmost/db/types/db';
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
  'scopes',
  'readOnly',
] as const;

export interface ApiKeyAuthRecord {
  id: string;
  keyHash: string | null;
  creatorId: string;
  workspaceId: string;
  deletedAt: Date | null;
  expiresAt: Date | null;
  /** ENG-1454 — the space-allowlist read by `intersectWithTokenScope` at the auth seam. */
  scopes: string[] | null;
  readOnly: boolean;
}

/**
 * ENG-1454 AC6 — the ONE place the jsonb `scopes` column is cast back to
 * its concrete `string[] | null` domain shape (CS §12 any-laundering
 * guard: cast once at the driver edge, never leaked as `unknown`/`any`
 * into domain code). A native jsonb array reads back as a real JS array —
 * this mapper does no parsing; if it ever saw a string here, that would
 * mean a write path re-introduced the double-encode bug.
 */
function toScopesArray(raw: unknown): string[] | null {
  if (raw == null) return null;
  return raw as string[];
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
      /**
       * ENG-1454 AC6 — the space-allowlist. Passed straight through as a
       * native JS array and cast ONCE at this driver edge (`as unknown as
       * Json`, CS §12 any-laundering guard) — NEVER `JSON.stringify`'d
       * first. Stringifying here would double-encode the jsonb column into
       * a jsonb STRING, which reads back as a string and breaks
       * `scopes.some(...)` with a 500 on every scoped request (the
       * postgres.js jsonb gotcha this AC fixes). `null`/absent = no space
       * restriction (AC7 unrestricted); `[]` = an explicit empty scope
       * (AC7 — the intersection of nothing is nothing).
       */
      scopes?: string[] | null;
      readOnly?: boolean;
    },
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .insertInto('apiKeys')
      .values({
        name: insertable.name,
        creatorId: insertable.creatorId,
        workspaceId: insertable.workspaceId,
        expiresAt: insertable.expiresAt ?? null,
        scopes: (insertable.scopes ?? null) as unknown as Json | null,
        readOnly: insertable.readOnly ?? false,
      })
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
    return { ...row, scopes: toScopesArray(row.scopes) };
  }

  async setKeyHash(
    apiKeyId: string,
    keyHash: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .updateTable('apiKeys')
      .set({ keyHash, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
    return { ...row, scopes: toScopesArray(row.scopes) };
  }

  /**
   * Auth-seam-only lookup — the ONE place `keyHash` is selected. Never
   * call this from a controller-facing list/read path.
   */
  async findAuthRecordById(
    apiKeyId: string,
    workspaceId: string,
  ): Promise<ApiKeyAuthRecord | undefined> {
    const row = await this.db
      .selectFrom('apiKeys')
      .select([
        'id',
        'keyHash',
        'creatorId',
        'workspaceId',
        'deletedAt',
        'expiresAt',
        'scopes',
        'readOnly',
      ])
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return row && { ...row, scopes: toScopesArray(row.scopes) };
  }

  async findPublicById(
    apiKeyId: string,
    workspaceId: string,
  ): Promise<ApiKeyPublicView | undefined> {
    const row = await this.db
      .selectFrom('apiKeys')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return row && { ...row, scopes: toScopesArray(row.scopes) };
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

    const rows = await query.execute();
    return rows.map((row) => ({ ...row, scopes: toScopesArray(row.scopes) }));
  }

  async updateName(
    apiKeyId: string,
    workspaceId: string,
    name: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView | undefined> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .updateTable('apiKeys')
      .set({ name, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirst();
    return row && { ...row, scopes: toScopesArray(row.scopes) };
  }

  async revoke(
    apiKeyId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ApiKeyPublicView | undefined> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirst();
    return row && { ...row, scopes: toScopesArray(row.scopes) };
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
