// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Controller, Module, Post } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  WORKSPACE_EXEMPT_EXACT_PATHS,
  WORKSPACE_EXEMPT_PATHS,
  isWorkspaceExempt,
  registerWorkspaceExemptPreHandler,
} from './orvex-workspace-exempt-paths';

/**
 * TestEngineCompositionTierExempt (ENG-3504) — proves the preHandler hook
 * itself (`registerWorkspaceExemptPreHandler` + the committed
 * `WORKSPACE_EXEMPT_PATHS` list) behaves correctly for the newly-added
 * engine composition-tier routes, WITHOUT depending on the real
 * WorkspaceController/PageController/SpaceController's Postgres/Redis-backed
 * business logic (those controllers only boot inside the full `AppModule`,
 * which needs a real database — out of THIS ticket's scope, which is
 * exclusively about whether the Fastify preHandler 404s the request BEFORE
 * any controller runs).
 *
 * This mounts a minimal dummy Nest module with handlers at the EXACT literal
 * paths added to the allow-list plus one path deliberately NOT added
 * (`/api/orvex/pages/supersede`, standing in for the real
 * orvex-page-supersede.controller.ts route this pass did not audit), wires
 * the SAME `registerWorkspaceExemptPreHandler` production code calls, and
 * asserts the hook's allow/deny boundary directly — this is the exact unit
 * under change, isolated from unrelated controller wiring.
 *
 * wiki-api's own live reproduction (ENG-3504's ticket body) already proved
 * the underlying defect against the real deployed engine; this test is the
 * committed regression pin for the fix, not a first discovery.
 */
@Controller()
class DummyCompositionTierController {
  @Post('workspace/info')
  workspaceInfo() {
    return { ok: true };
  }
  @Post('pages/info')
  pagesInfo() {
    return { ok: true };
  }
  @Post('pages/create')
  pagesCreate() {
    return { ok: true };
  }
  @Post('pages/upsert')
  pagesUpsert() {
    return { ok: true };
  }
  @Post('spaces/')
  spacesList() {
    return { ok: true };
  }
  // The EIGHT sibling SpaceController routes (core/space/space.controller.ts
  // `@Controller('spaces')`) that wiki-api's engine client NEVER calls —
  // `grep 'BaseURL+"/api/' internal/clients/clients.go` yields exactly one
  // `/api/spaces...` entry, `POST /api/spaces/` (clients.go:950, ListSpaces).
  // Mounted at their REAL paths so the prefix-vs-exact boundary is asserted
  // against the actual route shapes, not a stand-in.
  @Post('spaces/info')
  spacesInfo() {
    return { ok: true };
  }
  @Post('spaces/create')
  spacesCreate() {
    return { ok: true };
  }
  @Post('spaces/update')
  spacesUpdate() {
    return { ok: true };
  }
  @Post('spaces/delete')
  spacesDelete() {
    return { ok: true };
  }
  @Post('spaces/members')
  spacesMembers() {
    return { ok: true };
  }
  @Post('spaces/members/add')
  spacesMembersAdd() {
    return { ok: true };
  }
  @Post('spaces/members/remove')
  spacesMembersRemove() {
    return { ok: true };
  }
  @Post('spaces/members/change-role')
  spacesMembersChangeRole() {
    return { ok: true };
  }
  // Stand-in for orvex-page-supersede.controller.ts's real route — same
  // `orvex/pages` family as the apply-ops/apply-doc routes this pass
  // deliberately did NOT exempt (see the code comment). Proves the widening
  // did not spill over to sibling routes under that controller.
  @Post('orvex/pages/supersede')
  pagesSupersede() {
    return { ok: true };
  }
}

@Module({ controllers: [DummyCompositionTierController] })
class DummyCompositionTierModule {}

describe('TestEngineCompositionTierExempt (ENG-3504)', () => {
  const NEW_EXEMPT_ROUTES: readonly string[] = [
    '/api/workspace/info',
    '/api/pages/info',
    '/api/pages/create',
    '/api/pages/upsert',
    '/api/spaces/',
  ];

  /**
   * The routes that must STAY guarded. The eight are every OTHER
   * `SpaceController` route — the exact set a prefix entry `'/api/spaces/'`
   * silently admitted before this fix, and the reason the composition-tier
   * exemptions are exact-matched rather than prefix-matched. The ninth is the
   * `orvex/pages` sibling proving the same for that family.
   */
  const NOT_EXEMPT_CONTROL_ROUTES: readonly string[] = [
    '/api/spaces/info',
    '/api/spaces/create',
    '/api/spaces/update',
    '/api/spaces/delete',
    '/api/spaces/members',
    '/api/spaces/members/add',
    '/api/spaces/members/remove',
    '/api/spaces/members/change-role',
    '/api/orvex/pages/supersede',
  ];

  async function boot(
    beforeReady?: (app: NestFastifyApplication) => void,
  ): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [DummyCompositionTierModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      // routerOptions.ignoreTrailingSlash mirrors main.ts's REAL adapter
      // options exactly (same nested shape, not the deprecated flat form) —
      // without it a trailing-slash route like `/api/spaces/` (wiki-api's
      // actual client call, clients.go:950) would 404 on Fastify's own
      // router for reasons unrelated to the workspace-exempt hook, giving a
      // false negative here.
      new FastifyAdapter({ routerOptions: { ignoreTrailingSlash: true } }),
    );
    app.setGlobalPrefix('api');
    // The REAL production hook — the CLOUD-mode workspace-resolution
    // preHandler main.ts registers, imported (never hand-copied), against
    // the committed WORKSPACE_EXEMPT_PATHS list.
    registerWorkspaceExemptPreHandler(app);
    beforeReady?.(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it.each(NEW_EXEMPT_ROUTES)(
    'ENG-3504 — %s is reachable under the CLOUD hook (no Host->workspace match): NOT the preHandler 404',
    async (route) => {
      const app = await boot();
      try {
        const res = await app.inject({
          method: 'POST',
          url: route,
          headers: { host: 'no-such-workspace.example.com' },
        });
        expect(res.statusCode).toBe(201); // Nest's default 2xx for a POST handler
        expect(res.json()).toEqual({ ok: true });
      } finally {
        await app.close();
      }
    },
  );

  it.each(NOT_EXEMPT_CONTROL_ROUTES)(
    'ENG-3504 control — %s (NOT on either allow-list) STILL 404s "Workspace not found" under the identical CLOUD hook',
    async (route) => {
      const app = await boot();
      try {
        const res = await app.inject({
          method: 'POST',
          url: route,
          headers: { host: 'no-such-workspace.example.com' },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ message: 'Workspace not found' });
      } finally {
        await app.close();
      }
    },
  );

  it('ENG-3504 — `/api/spaces` (no trailing slash) is exempt too: `ignoreTrailingSlash` routes it to the SAME list handler, so the exact matcher must agree with the router', async () => {
    const app = await boot();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/spaces',
        headers: { host: 'no-such-workspace.example.com' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('ENG-3504 — a query string does not defeat the exact matcher (path is compared, not the raw URL)', () => {
    expect(isWorkspaceExempt('/api/pages/create?trace=1')).toBe(true);
    // ...and does not smuggle a non-exempt path past it either.
    expect(isWorkspaceExempt('/api/spaces/delete?x=/api/spaces/')).toBe(false);
  });

  it('ENG-3504 — under a RESOLVED workspace Host, both the new routes and the control route are equally reachable (the hook only gates the UNRESOLVED case)', async () => {
    const app = await boot((a) => {
      a.getHttpAdapter()
        .getInstance()
        .addHook('onRequest', (req, _reply, done) => {
          // Simulate DomainMiddleware having resolved a real workspace for
          // this Host, so both the exempt AND control routes bypass the
          // preHandler's guard the SAME way a genuinely-tenant-scoped
          // request would. Registered BEFORE app.init()/ready() — Fastify
          // refuses addHook once listening.
          (req.raw as unknown as Record<string, unknown>).workspaceId = 'ws_test';
          done();
        });
    });
    try {
      for (const route of [
        ...NEW_EXEMPT_ROUTES,
        ...NOT_EXEMPT_CONTROL_ROUTES,
      ]) {
        const res = await app.inject({
          method: 'POST',
          url: route,
          headers: { host: 'workspace.example.com' },
        });
        expect(res.statusCode).toBe(201);
      }
    } finally {
      await app.close();
    }
  });

  it('ENG-3504 — the 5 composition-tier routes are on the EXACT list (not the prefix list), and no entry anywhere is a prefix of a route that must stay guarded', () => {
    for (const route of NEW_EXEMPT_ROUTES) {
      expect(WORKSPACE_EXEMPT_EXACT_PATHS).toContain(route);
      // The bug this test pins: they must NOT be on the prefix list, where
      // `'/api/spaces/'` admitted all nine SpaceController routes.
      expect(WORKSPACE_EXEMPT_PATHS).not.toContain(route);
    }
    // Nothing on the PREFIX list may be a prefix of a control route — this is
    // the invariant, checked structurally rather than by enumerating today's
    // entries, so a future prefix addition that re-widens `/api/spaces/` or
    // `/api/orvex/pages/` reds here.
    for (const guarded of NOT_EXEMPT_CONTROL_ROUTES) {
      expect(
        WORKSPACE_EXEMPT_PATHS.filter((p) => guarded.startsWith(p)),
      ).toEqual([]);
      expect(isWorkspaceExempt(guarded)).toBe(false);
    }
    expect(
      WORKSPACE_EXEMPT_EXACT_PATHS.some((p) =>
        p.startsWith('/api/orvex/pages/'),
      ),
    ).toBe(false);
  });
});
