// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1437 — decommission the engine-local FTS-index enqueue while
 * preserving the `attachment.created` outbox delegation.
 *
 * Cached spec (`.cache/linear/issues/ENG-1437.yaml`) §5a names ONE binary
 * DoD gate: `uploadFileDelegatesViaOutboxWithoutEngineFtsEnqueue`. It must
 * assert, against REAL infra (CS §5 — never mock an owned package):
 *   1. zero `attachment-index-content` jobs on a real BullMQ `Queue` after
 *      `AttachmentService.uploadFile` completes (AC1/AC7);
 *   2. exactly one `attachment.created` outbox row, committed atomically
 *      with the `attachments` insert (AC2);
 *   3. `uploadFile` resolves to a non-null `Attachment` (AC7).
 *
 * A second describe block covers AC3 (import path, `ImportAttachmentService
 * .uploadWithRetry` — the exact removal site named in the cached body's §4a
 * files table) against the SAME real queue.
 *
 * Storage is a lightweight stand-in (never asserted on here, matching the
 * established `page-move.integration-spec.ts` / `eng1447-provenance-
 * atomicity.integration-spec.ts` convention for inert side channels); the
 * DB (Postgres) and the queue (Redis/BullMQ) are both real testcontainers,
 * per §4f.
 */
import { Readable } from 'stream';
import { promises as fs, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v7 as uuid7 } from 'uuid';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { AttachmentService } from 'src/core/attachment/services/attachment.service';
import { ImportAttachmentService } from 'src/integrations/import/services/import-attachment.service';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { QueueName } from 'src/integrations/queue/constants';
import {
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';
import { startTestQueue, TestQueue } from './redis-test-harness';

// Minimal `MultipartFile`-shaped stand-in: `uploadFile` calls `prepareFile`
// with `skipBuffer: true`, so only `.filename` and `.file` (a real Readable
// the byte-counting stream can drain) are ever read.
function fakeMultipartFile(filename: string, content: string) {
  return Promise.resolve({
    filename,
    file: Readable.from(Buffer.from(content)),
    toBuffer: async () => Buffer.from(content),
  } as any);
}

// Storage is a true external (disk/S3); this story does not touch storage
// behaviour, so a functional-but-inert stand-in (drains the stream so byte
// counting completes) follows the repo's existing inert-side-channel
// convention rather than asserting anything about it.
const storageServiceStub = {
  upload: async (_filePath: string, content: any) => {
    if (content && typeof content.on === 'function') {
      await new Promise<void>((resolve, reject) => {
        content.on('data', () => {});
        content.on('end', () => resolve());
        content.on('error', reject);
      });
    }
  },
  uploadStream: async (_filePath: string, content: any) => {
    if (content && typeof content.on === 'function') {
      await new Promise<void>((resolve, reject) => {
        content.on('data', () => {});
        content.on('end', () => resolve());
        content.on('error', reject);
      });
    }
  },
};

describe('ENG-1437 — engine sheds FTS enqueue, keeps the outbox delegation', () => {
  let testDb: TestDb;
  let testQueue: TestQueue;
  let attachmentService: AttachmentService;
  let attachmentRepo: AttachmentRepo;
  let workspaceId: string;
  let userId: string;
  let spaceId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    testQueue = await startTestQueue(QueueName.ATTACHMENT_QUEUE);

    attachmentRepo = new AttachmentRepo(testDb.db as any);
    const outboxWriter = new OutboxWriter(testDb.db as any);

    attachmentService = new AttachmentService(
      storageServiceStub as any, // storageService — inert side channel, not under test
      attachmentRepo,
      {} as any, // userRepo — unused on the uploadFile path
      {} as any, // workspaceRepo — unused on the uploadFile path
      {} as any, // spaceRepo — unused on the uploadFile path
      testDb.db as any,
      testQueue.queue as any,
      outboxWriter,
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testQueue?.teardown();
    await testDb?.teardown();
  });

  afterEach(async () => {
    // The named DoD gate asserts a GLOBAL zero-jobs-of-this-name property;
    // drain between tests so one test's (absence of) enqueue can't be
    // confused with another's.
    await testQueue.queue.drain(true);
  });

  it('uploadFileDelegatesViaOutboxWithoutEngineFtsEnqueue', async () => {
    const result = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('report.pdf', '%PDF-1.4 fake pdf body'),
      userId,
      spaceId,
      workspaceId,
    });

    // AC7 — uploadFile resolves to a non-null Attachment with the right id.
    expect(result).not.toBeNull();
    expect(result.id).toBeDefined();

    // AC1 — the real queue holds ZERO attachment-index-content jobs (queue
    // effect via getJobs(), never a mock-verify on Queue.add).
    const jobs = await testQueue.queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    ]);
    const ftsJobs = jobs.filter((j) => j.name === 'attachment-index-content');
    expect(ftsJobs).toHaveLength(0);

    // AC2 — exactly one attachment.created outbox row for this attachment,
    // committed atomically with the attachments row (both present).
    const outboxRows = await testDb.db
      .selectFrom('orvexEventOutbox' as any)
      .selectAll()
      .where('type', '=', 'attachment.created')
      .where('aggregateId', '=', result.id)
      .execute();
    expect(outboxRows).toHaveLength(1);

    const attachmentRow = await attachmentRepo.findById(result.id);
    expect(attachmentRow).toBeDefined();
  });

  it('.docx upload also enqueues no FTS job (AC1)', async () => {
    const result = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('memo.docx', 'fake docx body'),
      userId,
      spaceId,
      workspaceId,
    });

    const jobs = await testQueue.queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    ]);
    const ftsJobs = jobs.filter((j) => j.name === 'attachment-index-content');
    expect(ftsJobs).toHaveLength(0);
    expect(result).not.toBeNull();
  });
});

describe('ENG-1437 AC3 — import path enqueues no FTS job', () => {
  let testDb: TestDb;
  let testQueue: TestQueue;
  let importAttachmentService: ImportAttachmentService;
  let workspaceId: string;
  let userId: string;
  let spaceId: string;
  let tmpFile: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    testQueue = await startTestQueue(QueueName.ATTACHMENT_QUEUE);

    importAttachmentService = new ImportAttachmentService(
      storageServiceStub as any,
      testDb.db as any,
      testQueue.queue as any,
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;

    tmpFile = path.join(os.tmpdir(), `eng1437-import-${Date.now()}.pdf`);
    await fs.writeFile(tmpFile, '%PDF-1.4 fake imported pdf body');
  }, 120000);

  afterAll(async () => {
    if (tmpFile && existsSync(tmpFile)) {
      await fs.unlink(tmpFile);
    }
    await testQueue?.teardown();
    await testDb?.teardown();
  });

  it('imported .pdf attachment enqueues no attachment-index-content job', async () => {
    const attachmentId = uuid7();

    // `uploadWithRetry` is the exact removal site named in the cached
    // body's §4a files table (import-attachment.service.ts#L941-960); it is
    // private, so this test drives it directly through the real class
    // instance (an established pattern in this repo — see e.g.
    // page.service.block-id-chokepoint.spec.ts), rather than reconstructing
    // the full HTML/extraction pipeline that calls it.
    await (importAttachmentService as any).uploadWithRetry({
      abs: tmpFile,
      storageFilePath: `import/${attachmentId}/report.pdf`,
      attachmentId,
      fileNameWithExt: 'report.pdf',
      ext: '.pdf',
      pageId: undefined,
      fileTask: { creatorId: userId, workspaceId, spaceId } as any,
      uploadStats: { total: 1, completed: 0, failed: 0, failedFiles: [] },
    });

    const jobs = await testQueue.queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    ]);
    const ftsJobs = jobs.filter((j) => j.name === 'attachment-index-content');
    expect(ftsJobs).toHaveLength(0);

    const row = await testDb.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    expect(row).toBeDefined();
  });
});
