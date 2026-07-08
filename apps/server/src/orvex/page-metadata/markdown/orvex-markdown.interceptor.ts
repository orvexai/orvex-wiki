// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { OrvexPageMetadataService } from '../orvex-page-metadata.service';
import { OrvexPageMetadataDto } from '@orvex/extensions';
import { extractFrontmatter } from './frontmatter.util';

/**
 * ENG-1371 (AC8, §4a `orvex-markdown.interceptor.ts`) — the request-edge
 * adapter that wires `frontmatter.util.ts` into the real markdown
 * create/update path.
 *
 * Bound (via `@UseInterceptors`) to `PageController.create` / `.update`
 * (`apps/server/src/core/page/page.controller.ts`), the same unconditional
 * core-integration precedent as `OrvexPageProvenanceModule` (ENG-1447) — this
 * is not part of the flag-gated additive `OrvexRootModule` tree, it is a
 * core request-path adapter.
 *
 * Pipeline position: NestJS runs interceptors' pre-handler logic BEFORE the
 * body-validation pipe, so mutating `request.body.content` here strips the
 * frontmatter block before `PageService.create`/`.update` ever parses the
 * markdown into ProseMirror JSON (CS §0 — domain logic stays in the
 * service; this adapter only parses + maps + delegates, per 4c "request-edge
 * adapter: parse -> map -> service").
 *
 * Only acts when `format === 'markdown'` and `content` is a string; every
 * other request (json/html content, or markdown with zero frontmatter keys)
 * passes through completely unchanged — no behaviour change to markdown
 * import when there is no frontmatter to extract (4a "what must NOT break").
 *
 * `metadataService` is `@Optional()`: several pre-existing integration
 * harnesses build an ad-hoc `Test.createTestingModule({ controllers:
 * [PageController], ... })` without `PageModule`'s full import graph. Since
 * `@UseInterceptors(OrvexMarkdownInterceptor)` makes Nest JIT-instantiate
 * this class in whatever module hosts the controller, a hard (non-optional)
 * dependency would throw `Nest can't resolve dependencies of
 * OrvexMarkdownInterceptor` in those harnesses even though they never
 * exercise markdown+frontmatter. Optional + a null-check degrades to a
 * pure pass-through instead — real app wiring (`PageModule` imports
 * `OrvexPageMetadataModule`) always provides it.
 */
@Injectable()
export class OrvexMarkdownInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly metadataService?: OrvexPageMetadataService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const body = request?.body as
      | { format?: string; content?: unknown }
      | undefined;

    if (
      !this.metadataService ||
      !body ||
      body.format !== 'markdown' ||
      typeof body.content !== 'string'
    ) {
      return next.handle();
    }

    const { metadata, body: strippedBody, unknownKeys } = extractFrontmatter(
      body.content,
    );

    const hasUnknownKeys = Object.keys(unknownKeys).length > 0;
    const hasMetadata = Object.keys(metadata).length > 0 || hasUnknownKeys;

    if (!hasMetadata) {
      // No frontmatter present — leave the request completely untouched.
      return next.handle();
    }

    // Strip the frontmatter block so the page body never carries it.
    body.content = strippedBody;

    const dto: OrvexPageMetadataDto = {
      ...(metadata as OrvexPageMetadataDto),
      ...(hasUnknownKeys ? { unknownFrontmatter: unknownKeys } : {}),
    };

    return next.handle().pipe(
      switchMap((page: unknown) => {
        const pageId = isPageLike(page) ? page.id : undefined;
        if (!pageId) {
          return of(page);
        }
        return from(this.metadataService.applyMetadata(pageId, dto)).pipe(
          map(() => page),
        );
      }),
    );
  }
}

function isPageLike(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}
