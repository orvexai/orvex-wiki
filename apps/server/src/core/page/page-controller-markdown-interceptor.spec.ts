/**
 * ENG-1371 review1 F1/F2 — closes "grep -rn OrvexMarkdownInterceptor
 * apps/server/src -> no matches" / "nothing wires frontmatter into a
 * request path". Asserts, via Nest's own interceptor metadata (the same
 * metadata `@UseInterceptors` writes and Nest's executor reads at request
 * time), that `PageController.create` and `.update` are bound to
 * `OrvexMarkdownInterceptor` — a real, statically-checkable delivery path,
 * not just service-level logic exercised directly by a test.
 */
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { PageController } from './page.controller';
import { OrvexMarkdownInterceptor } from '../../orvex/page-metadata/markdown/orvex-markdown.interceptor';

describe('PageController markdown-interceptor wiring (ENG-1371 AC8)', () => {
  it.each(['create', 'update'] as const)(
    '%s is bound to OrvexMarkdownInterceptor via @UseInterceptors',
    (method) => {
      const bound: unknown[] = Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        PageController.prototype[method],
      );

      expect(bound).toBeDefined();
      expect(bound).toContain(OrvexMarkdownInterceptor);
    },
  );
});
