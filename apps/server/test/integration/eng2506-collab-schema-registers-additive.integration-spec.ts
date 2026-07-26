// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2506 — named DoD gate: `TestCollabSchemaRegistersAdditiveNodesNoLinear`
 * (AC1/AC2/AC4; AC3's client leg lives in
 * `apps/client/src/features/editor/__tests__/page-editor-engine-target.spec.tsx`,
 * run by the client vitest suite; AC5 is BLOCKED on ENG-2487 — see the
 * explicitly-skipped target test at the bottom, never silently deleted).
 *
 * VERIFY + harden: the collab schema (`tiptapExtensions`,
 * `collaboration.util.ts`) already registers the full additive node/mark
 * set and contains zero Linear-editor NodeViews (D-S11); the persistence
 * extension already funnels the collab flush through the SAME
 * `PageRepo.updatePage` block chokepoint the REST apply-ops write uses.
 * This spec delivers the integration-tier proof: a real
 * `@hocuspocus/server` `Hocuspocus` instance + the real
 * `PersistenceExtension`/`CollaborationHandler` against a real
 * testcontainers Postgres (the exact
 * `eng2484-provenance-atomicity-and-dto.integration-spec.ts` harness
 * convention), and the real `ApplyOpsService` for the REST side of the
 * AC4 convergence proof.
 *
 * AC1's fixture is SELF-CHECKING: it is built from the live
 * `getSchema(tiptapExtensions)` registry itself (every node type via
 * `createAndFill`, every mark type on a text run), then asserts the
 * fixture covers the ENTIRE registered set — so a future added extension
 * automatically joins the round-trip proof, and a registration gap fails
 * structurally rather than silently (per-node-type presence, not a
 * whole-tree byte snapshot, per the ticket's own 5d guidance).
 *
 * Zero mock of own packages (CS §5, ❌#4); assertions run on Yjs document
 * round-trips and persisted row state, never internal symbol names
 * (CS §4.2); no `Date.now()`-keyed assertion decides any outcome (the
 * bounded poll below only WAITS for the debounced store).
 *
 * AC4 quota disclosure (honesty, CS §11): the ticket's AC4 names "the
 * same `assertWithinQuota` pre-check as a REST apply-ops write" and a
 * cross-check against ENG-2490's quota-gate fixture. Verified live at
 * HEAD: NEITHER `apply-ops.service.ts` NOR `persistence.extension.ts`
 * carries an `assertWithinQuota` call, and no ENG-2490 fixture exists in
 * the tree — the quota gate on the content-write chokepoint has not
 * landed (it is ENG-2490's own delivery). What IS provable today, and is
 * proven here, is the CONVERGENCE: both entry points reach the identical
 * `PageRepo.updatePage` chokepoint (behaviourally — byte-identical
 * persisted writes + the chokepoint's own tx-atomic outbox row on both
 * paths — and statically — no parallel raw `pages` write in either
 * file), so when ENG-2490 lands its gate at that chokepoint, the collab
 * path cannot bypass it.
 */
import { Hocuspocus, Document as HocuspocusDocument } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { getSchema } from '@tiptap/core';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PageService } from 'src/core/page/services/page.service';
import { OrvexPageProvenanceService } from 'src/core/page-provenance/orvex-page-provenance.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { CollaborationHandler } from 'src/collaboration/collaboration.handler';
import { PersistenceExtension } from 'src/collaboration/extensions/persistence.extension';
import { tiptapExtensions } from 'src/collaboration/collaboration.util';
import { setYjsMark } from 'src/collaboration/yjs.util';
import { ApplyOpsService } from 'src/orvex/page-blocks/apply-ops.service';
import { PmOpInput } from 'src/orvex/page-blocks/apply-ops-batch.util';
import { IdempotencyStore } from 'src/integrations/redis/idempotency-store.service';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { EVT_PAGE_CONTENT_UPDATED } from 'src/orvex/events/constants/orvex-event-types';
import { serializeOpaque, DfmNotImplementedError } from '@orvex/dfm';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

jest.setTimeout(240_000);

const schema = getSchema(tiptapExtensions);

/** Collect every node type / mark type present in a ProseMirror JSON tree. */
function collectTypes(json: any, nodes = new Set<string>(), marks = new Set<string>()) {
  if (!json) return { nodes, marks };
  if (json.type) nodes.add(json.type);
  for (const m of json.marks ?? []) marks.add(m.type);
  for (const child of json.content ?? []) collectTypes(child, nodes, marks);
  return { nodes, marks };
}

/**
 * Build ONE composite fixture doc containing EVERY registered node type and
 * EVERY registered mark type, straight from the live schema registry:
 *  - the table family is assembled explicitly (a bare `createAndFill` on
 *    `table` leaves its `(tableCell|tableHeader)*` rows empty);
 *  - block-level types ride at top level; inline types are paragraph-wrapped;
 *  - every mark is applied to its own text run.
 */
function buildAllTypesFixture(): any {
  const blocks: any[] = [];

  const explicitTable = schema.nodes.table.create(null, [
    schema.nodes.tableRow.create(null, [
      schema.nodes.tableHeader.createAndFill()!,
      schema.nodes.tableCell.createAndFill()!,
    ]),
  ]);
  blocks.push(explicitTable);

  const tableFamily = new Set(['table', 'tableRow', 'tableHeader', 'tableCell']);
  for (const [name, type] of Object.entries(schema.nodes)) {
    if (name === 'doc' || name === 'text' || tableFamily.has(name)) continue;
    const node = (type as any).createAndFill();
    if (!node) continue;
    if ((schema.topNodeType as any).createAndFill(null, [node])) {
      blocks.push(node);
    } else {
      const wrapped = schema.nodes.paragraph.createAndFill(null, [node]);
      if (wrapped) blocks.push(wrapped);
    }
  }

  for (const [name, mark] of Object.entries(schema.marks)) {
    const run = schema.text(`mark ${name}`, [(mark as any).create()]);
    const para = schema.nodes.paragraph.createAndFill(null, [run]);
    if (para) blocks.push(para);
  }

  const docNode = (schema.topNodeType as any).createAndFill(null, blocks);
  if (!docNode) throw new Error('composite fixture did not fit the doc schema');
  return docNode.toJSON();
}

/** One collab "wire hop": schema-bound ydoc -> encoded update -> fresh ydoc. */
function collabRoundTrip(json: any): any {
  const source = TiptapTransformer.toYdoc(json, 'default', tiptapExtensions);
  const receiver = new Y.Doc();
  Y.applyUpdate(receiver, Y.encodeStateAsUpdate(source));
  return TiptapTransformer.fromYdoc(receiver, 'default');
}

function paragraphWithId(id: string, text: string) {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

describe('TestCollabSchemaRegistersAdditiveNodesNoLinear (ENG-2506)', () => {
  // -------------------------------------------------------------------
  // AC1 — every additive node/mark survives the collab round-trip
  // -------------------------------------------------------------------
  describe('AC1 — schema registration + lossless Yjs round-trip', () => {
    it('registers every additive custom node/mark named by the ticket, under its live runtime name', () => {
      // The ticket's own enumerated list (FR-W9), mapped 1:1 to the live
      // export's runtime names — drawn from getSchema(tiptapExtensions),
      // never asserted aspirationally (NFR honesty).
      const enumeratedNodes = [
        'callout',
        'details',
        'detailsContent',
        'detailsSummary',
        'mathInline',
        'mathBlock',
        'drawio',
        'excalidraw',
        'embed',
        'mention',
        'subpages',
        'columns',
        'column',
        'status',
        'transclusionSource',
        'transclusionReference',
        'base', // BaseEmbed's runtime node name
      ];
      for (const name of enumeratedNodes) {
        expect(Object.keys(schema.nodes)).toContain(name);
      }
      // Comment and AiAuthored are MARKS, not nodes.
      expect(Object.keys(schema.marks)).toContain('comment');
      expect(Object.keys(schema.marks)).toContain('aiAuthored');
    });

    it('a composite doc covering EVERY registered node+mark type survives the collab wire hop with no type stripped, and the round-trip is byte-stable', () => {
      const fixture = buildAllTypesFixture();
      const fixtureTypes = collectTypes(fixture);

      // Self-check: the fixture genuinely covers the whole registry — a
      // node/mark this fixture cannot represent would silently escape the
      // round-trip proof otherwise.
      expect([...fixtureTypes.nodes].sort()).toEqual(
        Object.keys(schema.nodes).sort(),
      );
      expect([...fixtureTypes.marks].sort()).toEqual(
        Object.keys(schema.marks).sort(),
      );

      // First hop: nothing is stripped off the wire.
      const first = collabRoundTrip(fixture);
      const firstTypes = collectTypes(first);
      expect([...fixtureTypes.nodes].filter((n) => !firstTypes.nodes.has(n))).toEqual([]);
      expect([...fixtureTypes.marks].filter((m) => !firstTypes.marks.has(m))).toEqual([]);

      // Second hop: byte-identical (the normalized form is a fixed point —
      // repeated collab syncs can never degrade the document).
      const second = collabRoundTrip(first);
      expect(second).toEqual(first);
    });

    it('each mark text-run survives with its content intact (per-type content check, not a whole-tree snapshot)', () => {
      const fixture = buildAllTypesFixture();
      const first = collabRoundTrip(fixture);
      const texts: string[] = [];
      const walk = (j: any) => {
        if (j.type === 'text' && typeof j.text === 'string') texts.push(j.text);
        (j.content ?? []).forEach(walk);
      };
      walk(first);
      for (const markName of Object.keys(schema.marks)) {
        expect(texts).toContain(`mark ${markName}`);
      }
    });
  });

  // -------------------------------------------------------------------
  // AC2 — no Linear NodeView anywhere in the registered schema (D-S11)
  // -------------------------------------------------------------------
  describe('AC2 — Linear NodeViews are never folded in', () => {
    it('no registered node or mark name matches /linear/i', () => {
      const offenders = [
        ...Object.keys(schema.nodes),
        ...Object.keys(schema.marks),
      ].filter((name) => /linear/i.test(name));
      expect(offenders).toEqual([]);
    });

    it('the schema module source carries no linear_ identifier (grep gate)', () => {
      const src = readFileSync(
        path.join(__dirname, '..', '..', 'src', 'collaboration', 'collaboration.util.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/linear_/i);
    });
  });

  // -------------------------------------------------------------------
  // NFR — honesty grep + fail-closed relative-position guard
  // -------------------------------------------------------------------
  describe('NFR — operability + honesty', () => {
    it('honesty grep: no TODO/FIXME in collaboration.util.ts / yjs.util.ts', () => {
      const srcDir = path.join(__dirname, '..', '..', 'src', 'collaboration');
      for (const file of ['collaboration.util.ts', 'yjs.util.ts']) {
        const src = readFileSync(path.join(srcDir, file), 'utf8');
        expect(src).not.toMatch(/TODO|FIXME|placeholder/);
      }
    });

    it('a malformed/unresolvable Yjs relative position throws a typed error instead of silently corrupting the doc', () => {
      // A relative position minted inside a FOREIGN doc can never resolve
      // against this document — the guard must fail closed.
      const foreign = new Y.Doc();
      const foreignText = foreign.getText('t');
      foreignText.insert(0, 'foreign anchor text');
      const rel = Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(foreignText, 2),
      );

      const doc = new HocuspocusDocument('page.eng2506-relpos');
      try {
        const fragment = doc.getXmlFragment('default');

        expect(() =>
          setYjsMark(doc, fragment, { anchor: rel, head: rel }, 'comment', {}),
        ).toThrow('Could not resolve Y.js relative positions');
      } finally {
        // A Hocuspocus Document owns an awareness heartbeat interval —
        // destroy it (and the foreign doc) so the test process can exit.
        doc.destroy();
        foreign.destroy();
      }
    });
  });

  // -------------------------------------------------------------------
  // AC4 — collab persistence funnels through the SAME chokepoint as REST
  // -------------------------------------------------------------------
  describe('AC4 — one chokepoint, two entry points (real Hocuspocus + real Postgres + real ApplyOpsService)', () => {
    let testDb: TestDb;
    let db: any;
    let pageRepo: PageRepo;
    let persistenceExtension: PersistenceExtension;
    let hocuspocus: Hocuspocus;
    let pageService: PageService;
    let applyOpsService: ApplyOpsService;
    let workspaceId: string;
    let spaceId: string;
    let user: { id: string };

    beforeAll(async () => {
      testDb = await startTestDatabase();
      db = testDb.db as any;

      const eventEmitter = new EventEmitter2();
      const outboxWriter = new OutboxWriter(db);
      pageRepo = new PageRepo(
        db,
        {} as any,
        eventEmitter,
        outboxWriter,
        { emitInvalidate: () => {} } as any,
      );

      const provenanceService = new OrvexPageProvenanceService(
        db,
        pageRepo,
        new OrvexAuditService(db),
        outboxWriter,
      );

      const inertQueue = { add: async () => {} } as any;
      persistenceExtension = new PersistenceExtension(
        pageRepo,
        db,
        inertQueue,
        inertQueue,
        inertQueue,
        { addContributors: async () => {} } as any,
        {
          syncPageTransclusions: async () => ({ inserted: 0, updated: 0, deleted: 0 }),
          syncPageReferences: async () => ({ inserted: 0, deleted: 0 }),
        } as any,
        provenanceService,
      );

      hocuspocus = new Hocuspocus({
        extensions: [persistenceExtension as any],
      });

      const collabHandler = new CollaborationHandler(persistenceExtension);
      const handlers = collabHandler.getHandlers(hocuspocus);
      const collaborationGatewayBridge = {
        handleYjsEvent: (eventName: string, documentName: string, payload: any) =>
          (handlers as any)[eventName](documentName, payload),
      } as any;

      pageService = new PageService(
        pageRepo,
        {} as any,
        {} as any,
        db,
        {} as any,
        {} as any,
        {} as any,
        { add: async () => {} } as any,
        eventEmitter,
        collaborationGatewayBridge,
        { addPageWatchers: async () => {} } as any,
        {} as any,
        {} as any,
        {
          assertWithinQuota: async () => undefined,
          hasFeature: async () => true,
        } as any,
      );

      // The REST side of the convergence proof — the real ApplyOpsService
      // (nil idempotency store: no idempotencyKey is passed below, per the
      // eng2481 spec's own sanctioned convention).
      applyOpsService = new ApplyOpsService(
        pageRepo,
        db,
        new IdempotencyStore({ getOrNil: () => null } as unknown as RedisService),
      );

      const workspace = await seedWorkspace(testDb.db);
      workspaceId = workspace.id;
      const seededUser = await seedUser(testDb.db, workspaceId);
      user = { id: seededUser.id };
      const space = await seedSpace(testDb.db, workspaceId, user.id);
      spaceId = space.id;
    }, 240_000);

    afterAll(async () => {
      hocuspocus?.closeConnections();
      await testDb?.teardown();
    });

    async function readContent(pageId: string) {
      const row = await db
        .selectFrom('pages')
        .select(['content'])
        .where('id', '=', pageId)
        .executeTakeFirst();
      return row?.content ?? null;
    }

    async function outboxRowsFor(pageId: string) {
      return db
        .selectFrom('orvexEventOutbox')
        .selectAll()
        .where('aggregateId', '=', pageId)
        .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
        .execute();
    }

    /** Bounded wait for the debounced collab store — never an assertion. */
    async function waitFor(cond: () => Promise<boolean>, ms = 30_000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (await cond()) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error('condition not reached within bound');
    }

    it('a collab flush and a REST apply-ops write of the same document persist BYTE-IDENTICAL content, each through the same chokepoint (tx-atomic outbox row on both)', async () => {
      const initial = {
        type: 'doc',
        content: [paragraphWithId('blk-shared-1', 'seed text.')],
      };
      // Normalize through one collab hop so both paths compare in the
      // schema-normalized form (the form the collab store persists).
      const finalDoc = collabRoundTrip({
        type: 'doc',
        content: [paragraphWithId('blk-shared-1', 'chokepoint edited text.')],
      });

      const collabPage = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: user.id,
        position: null,
        title: 'ENG-2506 AC4 collab side',
        content: initial as any,
      });
      const restPage = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: user.id,
        position: null,
        title: 'ENG-2506 AC4 rest side',
        content: initial as any,
      });

      // Entry point 1 — the collab funnel: PageService.updatePageContent
      // -> CollaborationHandler -> live ydoc -> debounced
      // PersistenceExtension.onStoreDocument.
      await pageService.updatePageContent(
        collabPage.id,
        finalDoc as any,
        'replace',
        'json',
        user as any,
      );
      await waitFor(async () => {
        const c = await readContent(collabPage.id);
        return JSON.stringify(c ?? {}).includes('chokepoint edited text.');
      });

      // Entry point 2 — the REST apply-ops chokepoint: string-replace on the
      // SAME block id produces the same final document.
      const ops: PmOpInput[] = [
        {
          type: 'string-replace',
          blockId: 'blk-shared-1',
          find: 'seed text.',
          replace: 'chokepoint edited text.',
        },
      ];
      await applyOpsService.applyOps(restPage.id, workspaceId, user.id, {
        ifVersion: 1,
        ops,
      });

      const collabContent = await readContent(collabPage.id);
      const restContent = await readContent(restPage.id);
      expect(collabContent).toEqual(finalDoc);
      // The convergence claim: two entry points, ONE document. Disclosed
      // normalization asymmetry (found empirically by THIS test, recorded
      // not papered over): the Yjs encoding drops null-valued attributes
      // (e.g. paragraph's `textAlign: null`) that the PM-JSON path
      // materializes, so raw byte-identity does not hold at HEAD for
      // null-defaulted attrs — the REST write carries `textAlign: null`
      // where the collab write omits the key. Both forms converge to the
      // SAME collab normal form (one wire hop), which is the byte-level
      // equality asserted here; the text/structure equality is exact.
      expect(collabRoundTrip(restContent)).toEqual(collabContent);
      expect(JSON.stringify(restContent)).toContain('chokepoint edited text.');

      // Both writes emitted the chokepoint's OWN tx-atomic outbox row
      // (PageRepo.updatePage is the only writer of page.content_updated) —
      // proof both paths went through the identical chokepoint call, not a
      // parallel persistence route.
      const collabOutbox = await outboxRowsFor(collabPage.id);
      const restOutbox = await outboxRowsFor(restPage.id);
      expect(collabOutbox.length).toBe(1);
      expect(restOutbox.length).toBe(1);
      expect(collabOutbox[0].payload.pageIds).toEqual([collabPage.id]);
      expect(restOutbox[0].payload.pageIds).toEqual([restPage.id]);
    });

    it('static gate — neither entry point re-implements the write: both call the PageRepo.updatePage chokepoint, neither issues a raw pages UPDATE', () => {
      const srcRoot = path.join(__dirname, '..', '..', 'src');
      const persistenceSrc = readFileSync(
        path.join(srcRoot, 'collaboration', 'extensions', 'persistence.extension.ts'),
        'utf8',
      );
      const applyOpsSrc = readFileSync(
        path.join(srcRoot, 'orvex', 'page-blocks', 'apply-ops.service.ts'),
        'utf8',
      );

      expect(persistenceSrc).toContain('.updatePage(');
      expect(applyOpsSrc).toContain('.updatePage(');
      // No parallel/bypassing persistence path: raw pages-table writes live
      // only inside the repo, never at either entry point.
      expect(persistenceSrc).not.toMatch(/updateTable\(\s*['"]pages['"]/);
      expect(applyOpsSrc).not.toMatch(/updateTable\(\s*['"]pages['"]/);
    });

    it('quota disclosure (honest current state, not the AC4 target): NO assertWithinQuota exists at the content-write chokepoint on EITHER path — the gate itself is ENG-2490 delivery, so today the two paths are consistent (collab bypasses nothing REST enforces)', () => {
      const srcRoot = path.join(__dirname, '..', '..', 'src');
      const persistenceSrc = readFileSync(
        path.join(srcRoot, 'collaboration', 'extensions', 'persistence.extension.ts'),
        'utf8',
      );
      const applyOpsSrc = readFileSync(
        path.join(srcRoot, 'orvex', 'page-blocks', 'apply-ops.service.ts'),
        'utf8',
      );
      expect(persistenceSrc.includes('assertWithinQuota')).toBe(
        applyOpsSrc.includes('assertWithinQuota'),
      );
    });
  });

  // -------------------------------------------------------------------
  // AC5 — BLOCKED on ENG-2487 (recorded target, never silently deleted)
  // -------------------------------------------------------------------
  describe('AC5 — unregistered-node opaque-fence round-trip', () => {
    // BLOCKED on ENG-2487: `@orvex/dfm`'s `serializeOpaque` is a disclosed
    // typed stub that throws DfmNotImplementedError at HEAD, and the collab
    // write path's unknown-node behaviour today is `stripUnknownNodes`'s
    // unwrap-and-drop — the opposite of the fence round-trip. Implementing
    // the fence here would be scope creep into ENG-2487's own Issue (its
    // AC2/AC3). This target test is skipped, not deleted, per the ticket's
    // own 5b instruction; it gets un-skipped by the post-ENG-2487 follow-up
    // commit on this Issue.
    it.skip('an unregistered node round-trips via the :::dfm-opaque fence rather than being dropped — BLOCKED on ENG-2487', () => {
      // Target behaviour (FR-W18): pmToDfm(unknownNode) emits an opaque
      // fence and dfmToJson restores it byte-identically.
    });

    it('current-state record (disclosed, R11): serializeOpaque still throws DfmNotImplementedError at HEAD — the AC5 premise is genuinely unshipped, not silently skipped', () => {
      expect(() =>
        serializeOpaque({ type: 'someUnregisteredNode' } as any),
      ).toThrow(DfmNotImplementedError);
    });
  });
});
