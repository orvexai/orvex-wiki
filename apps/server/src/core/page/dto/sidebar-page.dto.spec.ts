// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SidebarPageDto } from './sidebar-page.dto';

/**
 * Tree-nav 502 root-cause guard (amazing-MCP engine leg). wiki-api's
 * `GET /v1/wiki/{loc}/tree` composes over `POST /api/pages/sidebar-pages` by
 * listing a page's children and, having no space in hand, sends `spaceId: ""`.
 * Before the fix that empty string ran `@IsUUID()` (which `@IsOptional()` does
 * NOT skip for `''`) → 400 → surfaced to the caller as a bare 502. These tests
 * pin the empty-string → `undefined` normalization that lets the `pageId`
 * branch resolve the space itself.
 */
describe('SidebarPageDto — empty-string spaceId normalization (tree 502 fix)', () => {
  it('accepts an empty-string spaceId when a pageId is supplied (the tree path)', async () => {
    const dto = plainToInstance(SidebarPageDto, {
      spaceId: '',
      pageId: '019f5b59-02b3-7c62-859d-f18d6e867bed',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    // Normalized away so `@IsOptional()` genuinely skips `@IsUUID()`.
    expect(dto.spaceId).toBeUndefined();
    expect(dto.pageId).toBe('019f5b59-02b3-7c62-859d-f18d6e867bed');
  });

  it('still rejects a NON-empty malformed spaceId (guard not weakened)', async () => {
    const dto = plainToInstance(SidebarPageDto, { spaceId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'spaceId')).toBe(true);
  });

  it('accepts a real UUID spaceId (the /v1/list path, unchanged)', async () => {
    const dto = plainToInstance(SidebarPageDto, {
      spaceId: '019f5b57-1ef5-7a25-8a81-61c91aceafec',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
