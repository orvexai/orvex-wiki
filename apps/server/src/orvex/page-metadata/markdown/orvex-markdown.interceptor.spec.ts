import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { OrvexMarkdownInterceptor } from './orvex-markdown.interceptor';

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

function makeHandler(result: unknown): CallHandler {
  return { handle: () => of(result) } as CallHandler;
}

/**
 * ENG-1371 review1 F1 — the `@Optional()` degrade path. Several pre-existing
 * integration harnesses (`eng1369-page-history-restore-http.integration-spec.ts`,
 * `page.controller.spec.ts`) build an ad-hoc `PageController` test module
 * without `OrvexPageMetadataModule`; `@UseInterceptors` JIT-instantiates
 * `OrvexMarkdownInterceptor` there with no `OrvexPageMetadataService`
 * available. This must pass through untouched, not throw.
 */
describe('OrvexMarkdownInterceptor — @Optional() metadataService degrade', () => {
  it('passes through unchanged when metadataService is undefined, even for markdown+frontmatter', async () => {
    const interceptor = new OrvexMarkdownInterceptor(undefined);
    const body = {
      format: 'markdown',
      content: '---\nstatus: published\n---\nBody.',
    };

    const result = await interceptor
      .intercept(makeContext(body), makeHandler({ id: 'page-1' }))
      .toPromise();

    expect(body.content).toBe('---\nstatus: published\n---\nBody.');
    expect(result).toEqual({ id: 'page-1' });
  });
});
