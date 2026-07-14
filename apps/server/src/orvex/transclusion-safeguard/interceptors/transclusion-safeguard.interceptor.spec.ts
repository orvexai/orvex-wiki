// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Observable, of } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';
import { TransclusionSafeguardInterceptor } from './transclusion-safeguard.interceptor';
import { OrvexTransclusionSafeguardService } from '../orvex-transclusion-safeguard.service';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function drain(obs$: Observable<unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    obs$.subscribe({ next: () => {}, error: reject, complete: resolve });
  });
}

/**
 * AC7 (adapted, see the interceptor's docstring for the route-surface
 * rationale) — the interceptor fires ONLY on the real destructive
 * lifecycle routes in this repo (`/pages/delete`,
 * `/orvex/pages/status`(status=archived), `/orvex/pages/supersede`),
 * resolves pageId/operation/mode, and calls `enforceOrUnsync` BEFORE the
 * downstream handler; every other route (or a status-less/non-archived
 * status write) passes through untouched.
 */
describe('TransclusionSafeguardInterceptor', () => {
  function buildInterceptor(enforceOrUnsync: jest.Mock) {
    const service = { enforceOrUnsync } as unknown as OrvexTransclusionSafeguardService;
    return new TransclusionSafeguardInterceptor(service);
  }

  it('guards POST /pages/delete, mapping permanentlyDelete to permanent-delete', async () => {
    const enforceOrUnsync = jest.fn().mockResolvedValue({});
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: () => of('handled') };
    const request = {
      url: '/api/pages/delete',
      body: { pageId: 'p1', permanentlyDelete: true },
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    const result$ = interceptor.intercept(makeContext(request), next);
    await drain(result$);

    expect(enforceOrUnsync).toHaveBeenCalledWith(
      'p1',
      'permanent-delete',
      'block',
      { workspaceId: 'w1', actorId: 'u1', actorType: 'user' },
    );
  });

  it('guards POST /orvex/pages/status only when status=archived', async () => {
    const enforceOrUnsync = jest.fn().mockResolvedValue({});
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: () => of('handled') };
    const request = {
      url: '/api/orvex/pages/status',
      body: { pageId: 'p1', status: 'archived' },
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    const result$ = interceptor.intercept(makeContext(request), next);
    await drain(result$);

    expect(enforceOrUnsync).toHaveBeenCalledWith(
      'p1',
      'archive',
      'block',
      { workspaceId: 'w1', actorId: 'u1', actorType: 'user' },
    );
  });

  it('passes through /orvex/pages/status when status is not archived', () => {
    const enforceOrUnsync = jest.fn();
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: jest.fn().mockReturnValue(of('handled')) };
    const request = {
      url: '/api/orvex/pages/status',
      body: { pageId: 'p1', status: 'published' },
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    interceptor.intercept(makeContext(request), next);

    expect(next.handle).toHaveBeenCalled();
    expect(enforceOrUnsync).not.toHaveBeenCalled();
  });

  it('guards POST /orvex/pages/supersede unconditionally', async () => {
    const enforceOrUnsync = jest.fn().mockResolvedValue({});
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: () => of('handled') };
    const request = {
      url: '/api/orvex/pages/supersede',
      body: { pageId: 'p1', supersededBy: 'other-slug' },
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    const result$ = interceptor.intercept(makeContext(request), next);
    await drain(result$);

    expect(enforceOrUnsync).toHaveBeenCalledWith(
      'p1',
      'supersede',
      'block',
      { workspaceId: 'w1', actorId: 'u1', actorType: 'user' },
    );
  });

  it('passes through an unrelated route untouched', () => {
    const enforceOrUnsync = jest.fn();
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: jest.fn().mockReturnValue(of('handled')) };
    const request = {
      url: '/api/pages/create',
      body: { pageId: 'p1' },
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    interceptor.intercept(makeContext(request), next);

    expect(next.handle).toHaveBeenCalled();
    expect(enforceOrUnsync).not.toHaveBeenCalled();
  });

  it('passes through when pageId is missing', () => {
    const enforceOrUnsync = jest.fn();
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: jest.fn().mockReturnValue(of('handled')) };
    const request = {
      url: '/api/pages/delete',
      body: {},
      raw: { workspace: { id: 'w1' } },
      user: { user: { id: 'u1' } },
    };

    interceptor.intercept(makeContext(request), next);

    expect(next.handle).toHaveBeenCalled();
    expect(enforceOrUnsync).not.toHaveBeenCalled();
  });

  it('passes through when user/workspace is missing', () => {
    const enforceOrUnsync = jest.fn();
    const interceptor = buildInterceptor(enforceOrUnsync);
    const next = { handle: jest.fn().mockReturnValue(of('handled')) };
    const request = {
      url: '/api/pages/delete',
      body: { pageId: 'p1' },
      raw: {},
      user: undefined,
    };

    interceptor.intercept(makeContext(request), next);

    expect(next.handle).toHaveBeenCalled();
    expect(enforceOrUnsync).not.toHaveBeenCalled();
  });
});
