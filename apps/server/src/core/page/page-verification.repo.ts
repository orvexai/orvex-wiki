// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { DB } from '@docmost/db/types/db';
import {
  InsertablePageVerification,
  PageVerification,
  UpdatablePageVerification,
} from '@docmost/db/types/entity.types';

export type PageVerificationWithVerifiers = PageVerification & {
  verifiers: Array<{ id: string; name: string; avatarUrl: string | null; email: string }>;
};

/**
 * ENG-1459 (AC1, AC3) — the engine-resident QMS verification repo. Every
 * read is scoped by `workspaceId` (and `spaceId` where the caller has it)
 * so a caller from a different workspace can never read another
 * workspace's verification row (AC3 — no unscoped read exists on this
 * class).
 */
@Injectable()
export class PageVerificationRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  withVerifiers(eb: ExpressionBuilder<DB, 'pageVerifications'>) {
    return jsonArrayFrom(
      eb
        .selectFrom('pageVerifiers')
        .innerJoin('users', 'users.id', 'pageVerifiers.userId')
        .select([
          'users.id',
          'users.name',
          'users.avatarUrl',
          'users.email',
        ])
        .whereRef('pageVerifiers.pageVerificationId', '=', 'pageVerifications.id'),
    ).as('verifiers');
  }

  async findByPageId(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<PageVerificationWithVerifiers | undefined> {
    const db = dbOrTx(this.db, trx);

    return db
      .selectFrom('pageVerifications')
      .selectAll('pageVerifications')
      .select((eb) => this.withVerifiers(eb))
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<PageVerification | undefined> {
    const db = dbOrTx(this.db, trx);

    return db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async insertVerification(
    insertable: InsertablePageVerification,
    trx?: KyselyTransaction,
  ): Promise<PageVerification> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('pageVerifications')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateVerification(
    id: string,
    workspaceId: string,
    updatable: UpdatablePageVerification,
    trx?: KyselyTransaction,
  ): Promise<PageVerification> {
    const db = dbOrTx(this.db, trx);

    return db
      .updateTable('pageVerifications')
      .set(updatable)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteByPageId(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .deleteFrom('pageVerifications')
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async replaceVerifiers(
    pageVerificationId: string,
    verifierUserIds: string[],
    addedById: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .deleteFrom('pageVerifiers')
      .where('pageVerificationId', '=', pageVerificationId)
      .execute();

    if (verifierUserIds.length === 0) {
      return;
    }

    await db
      .insertInto('pageVerifiers')
      .values(
        verifierUserIds.map((userId, index) => ({
          pageVerificationId,
          userId,
          isPrimary: index === 0,
          addedById,
        })),
      )
      .execute();
  }

  /**
   * AC6 (edge, same-DB path) — orphan sweep for verification rows whose
   * page/space no longer exists. The migration's `onDelete('cascade')` FK
   * already prevents orphans within THIS database (ruling 7 only requires
   * an explicit consumer+sweep where a DB split separates the tables from
   * the page/space owner — not the case here, single DB). This method
   * exists so the reconcile path is provable/testable even though the FK
   * makes it a no-op today.
   */
  async countOrphans(workspaceId: string, trx?: KyselyTransaction): Promise<number> {
    const db = dbOrTx(this.db, trx);

    const result = await db
      .selectFrom('pageVerifications')
      .leftJoin('pages', 'pages.id', 'pageVerifications.pageId')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('pageVerifications.workspaceId', '=', workspaceId)
      .where('pages.id', 'is', null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }
}
