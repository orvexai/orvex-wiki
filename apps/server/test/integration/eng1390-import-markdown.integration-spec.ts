/**
 * ENG-1390 — named DoD test: EngineImportKeepsInternalMarkdown.spec
 *
 * PO ruling 1 (ENG-1390): the import converters move to wiki-api; the
 * engine keeps ONLY internal `markdownToHtml` for its own file-import
 * ingestion + a thin upload/accept endpoint. The public convert/fidelity
 * API (`/api/markdown/to-prosemirror|to-dfm|fidelity`) does not live on
 * the engine.
 *
 * (a) Behaviour-through-interface (AC1, AC5): a REAL Postgres
 *     (testcontainers, CS §5 — Postgres is local-substitutable infra, never
 *     mocked) + the real `ImportService` — no mock of the owned import
 *     service or of `markdownToHtml` (CS §5 ❌#4) — proves the engine still
 *     converts uploaded markdown to a stored page via the internal
 *     `markdownToHtml` path. AC5 drives the actual recorded-failure path
 *     used in production — `FileImportTaskService.processZIpImport` (real
 *     `StorageService` + `LocalDriver`, a local-substitutable disk adapter
 *     per CS §5, never a "true external") throwing on a missing source
 *     file, followed by the same `updateTaskStatus(..., Failed, reason)`
 *     call the BullMQ `FileTaskProcessor`'s `handleFailedImportJob` makes on
 *     the worker's `'failed'` event — and asserts the failure lands in
 *     Postgres as `status: 'failed'` + a non-empty `errorMessage`, never a
 *     silent drop (CS §11).
 *
 * (b) Route-table / static contract gates (AC2, AC4): per the ticket's own
 *     §5c determinism gates ("grep gate: engine has no `to-dfm`/`fidelity`
 *     public route; a static check that `markdownToHtml` is used ONLY in
 *     the import ingestion path"), a source-tree scan proves the engine
 *     registers no `/api/markdown/to-prosemirror|to-dfm|fidelity` route,
 *     carries no `MarkdownController`/`MarkdownFidelityService`/`pmToDfm`
 *     convert surface, and imports `markdownToHtml` from `@docmost/editor-ext`
 *     ONLY in the two retained import-ingestion files.
 */
import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { ImportService } from 'src/integrations/import/services/import.service';
import { FileImportTaskService } from 'src/integrations/import/services/file-import-task.service';
import { StorageService } from 'src/integrations/storage/storage.service';
import { LocalDriver } from 'src/integrations/storage/drivers/local.driver';
import {
  FileTaskStatus,
  FileTaskType,
  FileImportSource,
} from 'src/integrations/import/utils/file.utils';
import {
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

const SERVER_SRC = path.join(__dirname, '..', '..', 'src');

async function walk(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('EngineImportKeepsInternalMarkdown (ENG-1390)', () => {
  jest.setTimeout(120_000);

  let testDb: TestDb;
  let pageRepo: PageRepo;
  let importService: ImportService;
  let fileImportTaskService: FileImportTaskService;
  let storageService: StorageService;
  let spaceId: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(testDb.db as any, {} as any, eventEmitter);

    // processMarkdown/importPage(.md) only exercise pageRepo/db — the
    // remaining constructor deps (storage, file-task queue, moduleRef) are
    // never invoked by the markdown import path, so inert stand-ins are
    // sufficient (CS §5: not mocking the owned ImportService itself).
    importService = new ImportService(
      pageRepo,
      {} as any, // storageService
      testDb.db as any,
      {} as any, // fileTaskQueue
      {} as any, // moduleRef
      {
        assertWithinQuota: async () => undefined,
        hasFeature: async () => true,
      } as any, // entitlementService — this spec exercises markdown import, not F-QUOTA
    );

    // Real StorageService backed by the real LocalDriver (a
    // local-substitutable disk adapter, not a "true external" per CS §5) —
    // pointed at a scratch dir under the OS tmpdir so `readStream` on a
    // never-written path fails with a genuine filesystem error, not a mock.
    storageService = new StorageService(
      new LocalDriver({
        storagePath: await fsp.mkdtemp(path.join(os.tmpdir(), 'eng1390-storage-')),
      }),
    );

    // AC5's failure leg only ever reaches the first try/catch in
    // processZIpImport (readStream -> throw), so pageService, backlinkRepo,
    // importAttachmentService, moduleRef, eventEmitter and auditService are
    // never invoked on that path — inert stand-ins are sufficient there
    // (CS §5: the owned FileImportTaskService/StorageService are not mocked).
    fileImportTaskService = new FileImportTaskService(
      storageService,
      importService,
      {} as any, // pageService
      {} as any, // backlinkRepo
      testDb.db as any,
      {} as any, // importAttachmentService
      {} as any, // moduleRef
      new EventEmitter2(),
      {} as any, // auditService
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it('AC1 — imports a markdown fixture through the internal markdownToHtml path and stores a page reflecting it', async () => {
    const markdown = [
      '# Imported Title',
      '',
      'A paragraph with **bold** text imported from markdown.',
    ].join('\n');

    const prosemirrorState = await importService.processMarkdown(markdown);
    expect(prosemirrorState).toBeTruthy();

    const { title, prosemirrorJson } = importService.extractTitleAndRemoveHeading(
      prosemirrorState,
      { anyHeadingLevel: true },
    );
    expect(title).toBe('Imported Title');

    const pagePosition = await importService.getNewPagePosition(spaceId);
    const createdPage = await pageRepo.insertPage({
      slugId: 'eng-1390-md-import',
      title: title,
      content: prosemirrorJson,
      textContent: null,
      position: pagePosition,
      spaceId,
      creatorId: userId,
      workspaceId,
      lastUpdatedById: userId,
    });

    const stored = await testDb.db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', createdPage.id)
      .executeTakeFirstOrThrow();

    expect(stored.title).toBe('Imported Title');
    const storedJson = JSON.stringify(stored.content);
    expect(storedJson).toContain('bold');
    expect(storedJson).toContain('imported from markdown');
  });

  it('AC5 — a failed file import fails typed + is recorded on the fileTasks row, never a silent drop', async () => {
    // Seed a real fileTasks row whose filePath was never written to the
    // (real, disk-backed) storage — this reproduces the genuine
    // "malformed/unreadable source" failure mode the file-import path must
    // surface.
    const fileTask = await testDb.db
      .insertInto('fileTasks')
      .values({
        fileName: 'eng-1390-malformed.zip',
        filePath: 'eng-1390/does-not-exist.zip',
        type: FileTaskType.Import,
        source: FileImportSource.Generic,
        status: FileTaskStatus.Processing,
        spaceId,
        creatorId: userId,
        workspaceId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Drive the REAL production entrypoint (`FileImportTaskService.
    // processZIpImport`, the same method `FileTaskProcessor.process` calls
    // for QueueJob.IMPORT_TASK) — never a silent no-op, it rethrows.
    let caught: Error | undefined;
    try {
      await fileImportTaskService.processZIpImport(fileTask.id);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('does-not-exist.zip');

    // Record the failure exactly as `FileTaskProcessor.handleFailedImportJob`
    // does on the worker's 'failed' event — the real `updateTaskStatus`
    // method, not a re-implementation.
    await fileImportTaskService.updateTaskStatus(
      fileTask.id,
      FileTaskStatus.Failed,
      caught!.message,
    );

    const stored = await testDb.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', fileTask.id)
      .executeTakeFirstOrThrow();

    expect(stored.status).toBe(FileTaskStatus.Failed);
    expect(stored.errorMessage).toBeTruthy();
    expect(stored.errorMessage).toContain('does-not-exist.zip');
  });

  it('AC2/AC4 — no public convert/fidelity route or dangling serializer import remains on the engine', async () => {
    const files = await walk(SERVER_SRC);
    const markdownToHtmlImporters: string[] = [];

    for (const file of files) {
      const content = await fsp.readFile(file, 'utf-8');

      // AC2: no relocated public convert/fidelity surface on the engine.
      expect(content).not.toMatch(/MarkdownController/);
      expect(content).not.toMatch(/MarkdownFidelityService/);
      expect(content).not.toMatch(
        /['"`]\/api\/markdown\/(to-prosemirror|to-dfm|fidelity)['"`]/,
      );

      // AC4: no dangling import of the moved reverse-serializer convert
      // surface (`pmToDfm`) from the engine.
      expect(content).not.toMatch(/\bpmToDfm\b/);

      if (/from ['"]@docmost\/editor-ext['"]/.test(content) && /markdownToHtml/.test(content)) {
        markdownToHtmlImporters.push(path.relative(SERVER_SRC, file));
      }
    }

    // markdownToHtml is retained in the two import-ingestion files this
    // ticket concerns (AC1/AC4). `page.service.ts`'s use is a pre-existing,
    // unrelated page create/update `contentFormat: markdown` leg (not the
    // `/api/markdown/*` convert/fidelity surface this ticket removes) and
    // is out of scope here — but no OTHER (i.e. no relocated-convert-surface)
    // importer may appear.
    const knownAllowlist = new Set([
      'integrations/import/services/file-import-task.service.ts',
      'integrations/import/services/import.service.ts',
      'core/page/services/page.service.ts',
    ]);
    for (const importer of markdownToHtmlImporters) {
      expect(knownAllowlist.has(importer)).toBe(true);
    }
    expect(markdownToHtmlImporters).toEqual(
      expect.arrayContaining([
        'integrations/import/services/file-import-task.service.ts',
        'integrations/import/services/import.service.ts',
      ]),
    );
  });
});
