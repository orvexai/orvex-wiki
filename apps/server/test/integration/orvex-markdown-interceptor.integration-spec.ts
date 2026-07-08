/**
 * ENG-1371 review1 F1 — proves `OrvexMarkdownInterceptor` is a real
 * request-edge adapter, not just service-level logic exercised directly.
 *
 * Drives `intercept()` with a fake `ExecutionContext`/`CallHandler` shaped
 * exactly like NestJS's real invocation (request.body = the raw
 * CreatePageDto JSON, next.handle() = the controller's return value), against
 * a REAL `OrvexPageMetadataService` + Postgres (testcontainers) — CS §5:
 * never mock the metadata service or repos (own packages).
 */
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { OrvexPageMetadataService } from '../../src/orvex/page-metadata/orvex-page-metadata.service';
import { OrvexMarkdownInterceptor } from '../../src/orvex/page-metadata/markdown/orvex-markdown.interceptor';
import { PageStatus } from '@orvex/extensions';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(result: unknown): CallHandler {
  return { handle: () => of(result) } as CallHandler;
}

describe('OrvexMarkdownInterceptor (ENG-1371 AC8, request-edge wiring)', () => {
  let testDb: TestDb;
  let service: OrvexPageMetadataService;
  let interceptor: OrvexMarkdownInterceptor;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const workspaceRepo = new WorkspaceRepo(testDb.db as any);
    service = new OrvexPageMetadataService(testDb.db as any, workspaceRepo);
    interceptor = new OrvexMarkdownInterceptor(service);

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it('a markdown create request carrying frontmatter lands recognised + unknown keys in orvex_page_meta, and strips the block from request.body.content', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'im0',
      title: 'eng-1371-interceptor-create',
    });

    const body = {
      spaceId,
      format: 'markdown',
      content:
        '---\nstatus: published\ndoc_type: architecture\ncustom_novel_key: hello-world\n---\n# Body text',
    };

    const result = await interceptor
      .intercept(makeContext(body), makeHandler({ id: page.id, spaceId }))
      .toPromise();

    // Request-edge mutation: the frontmatter block is stripped before the
    // controller/PageService ever sees it.
    expect(body.content).toBe('# Body text');
    // The handler's return value passes through unchanged.
    expect(result).toEqual({ id: page.id, spaceId });

    const meta = await service.getMetadata(page.id);
    expect(meta.status).toBe(PageStatus.PUBLISHED);
    expect(meta.docType).toBe('architecture');
    expect(meta.unknownFrontmatter).toEqual({ custom_novel_key: 'hello-world' });
  });

  it('a markdown request with NO frontmatter passes through untouched (no service write, no content mutation)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'im1',
      title: 'eng-1371-interceptor-no-frontmatter',
    });

    const body = { spaceId, format: 'markdown', content: '# Just a body' };

    await interceptor
      .intercept(makeContext(body), makeHandler({ id: page.id, spaceId }))
      .toPromise();

    expect(body.content).toBe('# Just a body');
    const meta = await service.getMetadata(page.id);
    expect(meta.status).toBe(PageStatus.DRAFT); // untouched default — no row written
  });

  it('a non-markdown (json) request is never inspected for frontmatter', async () => {
    const body = { spaceId, format: 'json', content: { type: 'doc' } };

    const result = await interceptor
      .intercept(makeContext(body), makeHandler({ id: 'irrelevant' }))
      .toPromise();

    expect(body.content).toEqual({ type: 'doc' });
    expect(result).toEqual({ id: 'irrelevant' });
  });
});
