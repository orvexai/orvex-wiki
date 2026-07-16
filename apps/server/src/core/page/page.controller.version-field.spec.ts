// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { PageController } from './page.controller';
import { PageRepo } from '@docmost/db/repos/page/page.repo';

/**
 * The read/create surfaces MUST expose the INTEGER `orvex_page_meta.version`
 * (the value the apply-ops / If-Match CAS compares) as `version`, NOT the
 * `updatedAt` timestamp. Without this a client cannot read a page then feed
 * the read version back into an If-Match edit — the wiki-api edit path
 * `strconv.ParseInt`s the token and rejects an ISO timestamp. Verified here
 * through the REAL `PageController.getPage` / `PageController.create` handlers.
 */
describe('PageController — integer meta.version exposure (read-then-CAS round-trip)', () => {
  const WORKSPACE = { id: 'ws-1' } as any;
  const USER = { id: 'user-1' } as any;

  function makeController(opts: {
    findById?: jest.Mock;
    getMetaVersion?: jest.Mock;
    create?: jest.Mock;
    update?: jest.Mock;
    upsert?: jest.Mock;
  }) {
    const pageRepo = {
      findById: opts.findById ?? jest.fn(),
      getMetaVersion: opts.getMetaVersion ?? jest.fn(async () => 1),
    };
    const pageService = {
      create: opts.create ?? jest.fn(),
      update: opts.update ?? jest.fn(),
      upsert: opts.upsert ?? jest.fn(),
    };
    const pageAccessService = {
      validateCanViewWithPermissions: jest.fn(async () => ({
        canEdit: true,
        hasRestriction: false,
      })),
      validateCanEdit: jest.fn(async () => ({ hasRestriction: false })),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({ cannot: () => false })),
    };
    const auditService = { log: jest.fn() };
    const db = {
      transaction: () => ({
        execute: (cb: any) => cb({} /* trx */),
      }),
    };

    const controller = new PageController(
      pageService as any,
      pageRepo as any,
      {} as any, // pageHistoryService
      spaceAbility as any,
      pageAccessService as any,
      {} as any, // backlinkService
      {} as any, // labelService
      auditService as any,
      {} as any, // provenanceService
      db as any,
      {} as any, // confirmTokenService
    );

    return { controller, pageRepo, pageService };
  }

  it('getMetaVersion defaults a meta-less page to the documented baseline 1, and reports the real integer otherwise', async () => {
    // The one honest default (`meta?.version ?? 1`) lives in one place.
    const getPageMeta = jest
      .fn()
      .mockResolvedValueOnce(undefined) // never apply-ops'd -> no meta row
      .mockResolvedValueOnce({ version: 7 }); // real CAS version

    const repoLike = { getPageMeta } as unknown as PageRepo;

    await expect(PageRepo.prototype.getMetaVersion.call(repoLike, 'p1')).resolves.toBe(1);
    await expect(PageRepo.prototype.getMetaVersion.call(repoLike, 'p1')).resolves.toBe(7);
  });

  it('/info (getPage) returns the INTEGER meta.version as `version`, not the updatedAt timestamp', async () => {
    const page = {
      id: 'page-1',
      slugId: 'slug-1',
      title: 'Doc',
      spaceId: 'space-1',
      parentPageId: null,
      updatedAt: new Date('2026-07-14T10:00:00.000Z'),
      content: null,
    };
    const { controller } = makeController({
      findById: jest.fn(async () => page),
      getMetaVersion: jest.fn(async () => 4),
    });

    const res: any = await controller.getPage({ pageId: 'page-1' } as any, USER);

    expect(typeof res.version).toBe('number');
    expect(Number.isInteger(res.version)).toBe(true);
    expect(res.version).toBe(4);
    // The timestamp is NOT the version surrogate anymore.
    expect(res.version).not.toBe(page.updatedAt);
  });

  it('/create returns the INTEGER baseline version (1) for a freshly-created, meta-less page', async () => {
    const created = {
      id: 'page-new',
      slugId: 'slug-new',
      title: 'New',
      spaceId: 'space-1',
      parentPageId: null,
      updatedAt: new Date('2026-07-14T11:00:00.000Z'),
      content: null,
    };
    const getMetaVersion = jest.fn(async () => 1);
    const { controller } = makeController({
      create: jest.fn(async () => created),
      getMetaVersion,
    });

    const res: any = await controller.create(
      { spaceId: 'space-1', title: 'New' } as any,
      USER,
      WORKSPACE,
      undefined,
    );

    expect(getMetaVersion).toHaveBeenCalledWith('page-new');
    expect(typeof res.version).toBe('number');
    expect(res.version).toBe(1);
  });

  it('/update returns the INTEGER meta.version as `version` (write receipt CAS round-trip)', async () => {
    const page = {
      id: 'page-1',
      slugId: 'slug-1',
      title: 'Doc',
      spaceId: 'space-1',
      parentPageId: null,
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
      content: null,
    };
    const { controller } = makeController({
      findById: jest.fn(async () => page),
      update: jest.fn(async () => ({ ...page, content: null })),
      getMetaVersion: jest.fn(async () => 6),
    });

    const res: any = await controller.update(
      { pageId: 'page-1' } as any,
      USER,
      WORKSPACE,
      undefined,
      undefined,
    );

    expect(typeof res.version).toBe('number');
    expect(res.version).toBe(6);
    // NOT the updatedAt timestamp surrogate.
    expect(res.version).not.toBe(page.updatedAt);
  });

  it('/upsert returns the INTEGER meta.version as `version` alongside the upserted verb', async () => {
    const page = {
      id: 'page-up',
      slugId: 'slug-up',
      title: 'Up',
      spaceId: 'space-1',
      parentPageId: null,
      updatedAt: new Date('2026-07-16T11:00:00.000Z'),
      content: null,
    };
    const { controller } = makeController({
      // upsert's edit-branch pre-flight lookup: found existing in workspace.
      findById: jest.fn(async () => ({ ...page, workspaceId: 'ws-1' })),
      upsert: jest.fn(async () => ({ page, upserted: 'updated' })),
      getMetaVersion: jest.fn(async () => 9),
    });

    const res: any = await controller.upsert(
      { slugId: 'slug-up', title: 'Up', spaceId: 'space-1' } as any,
      USER,
      WORKSPACE,
    );

    expect(typeof res.version).toBe('number');
    expect(res.version).toBe(9);
    expect(res.upserted).toBe('updated');
  });
});
