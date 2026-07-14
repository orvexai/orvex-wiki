import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Label } from '@docmost/db/types/entity.types';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { normalizeLabelName } from './utils';

export const ORVEX_LABEL_SERVICE = Symbol('ORVEX_LABEL_SERVICE');

export type LabelScope = 'space' | 'workspace';

/**
 * Space/workspace-scoped labels layered over upstream page labels (ENG-1385).
 *
 * A label is resolved/created against either a single space (`spaceId` set)
 * or the whole workspace (`spaceId` null). Uniqueness is enforced at the DB
 * layer by two partial unique indexes (see migration
 * 20260707T100000-orvex-space-scoped-labels) -- this service never has to
 * duplicate that invariant in application code, it just needs to query and
 * insert consistently with it.
 */
@Injectable()
export class OrvexLabelService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  /**
   * Find-or-create a label at the requested scope. `scope` defaults to
   * `'space'`: pass `'workspace'` explicitly to create/resolve a
   * workspace-wide label (`spaceId` NULL).
   */
  async resolveLabelForAttach(
    name: string,
    workspaceId: string,
    pageSpaceId: string,
    scope: LabelScope = 'space',
    type: LabelType = LabelType.PAGE,
    trx?: KyselyTransaction,
  ): Promise<Label> {
    const db = dbOrTx(this.db, trx);
    const normalizedName = normalizeLabelName(name);
    const spaceId = scope === 'workspace' ? null : pageSpaceId;

    const existing = await this.findLabel(
      db,
      workspaceId,
      type,
      normalizedName,
      spaceId,
    );
    if (existing) {
      return existing;
    }

    return db
      .insertInto('labels')
      .values({
        name: normalizedName,
        type,
        workspaceId,
        spaceId,
      })
      .onConflict((oc) =>
        scope === 'workspace'
          ? oc
              .columns(['workspaceId', 'type', 'name'])
              // partial-unique conflict targets require the matching WHERE
              .where('spaceId', 'is', null)
              .doUpdateSet({ name: normalizedName })
          : oc
              .columns(['workspaceId', 'type', 'spaceId', 'name'])
              .where('spaceId', 'is not', null)
              .doUpdateSet({ name: normalizedName }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private findLabel(
    db: KyselyDB | KyselyTransaction,
    workspaceId: string,
    type: LabelType,
    name: string,
    spaceId: string | null,
  ) {
    let query = db
      .selectFrom('labels')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', type)
      .where('name', '=', name);

    query =
      spaceId === null
        ? query.where('spaceId', 'is', null)
        : query.where('spaceId', '=', spaceId);

    return query.executeTakeFirst();
  }

  /**
   * Throws `ForbiddenException` if `userId` cannot see `label`.
   * Workspace-scoped labels (`spaceId` null) are visible to any workspace
   * member; space-scoped labels require space membership (direct or via
   * group), delegated to `SpaceMemberRepo.getUserSpaceRoles`.
   */
  async assertVisibility(label: Label, userId: string): Promise<void> {
    if (label.spaceId === null) {
      return;
    }

    const roles = await this.spaceMemberRepo.getUserSpaceRoles(
      userId,
      label.spaceId,
    );
    if (!roles || roles.length === 0) {
      throw new ForbiddenException(
        'You do not have access to this space-scoped label',
      );
    }
  }
}
