// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import { WorkspaceCellAssertionService } from '../../common/cell-isolation/workspace-cell-assertion.service';
import { ShareSeoController } from './share-seo.controller';
import { ShareService } from './share.service';
import { ShareSeoCellInterceptor } from '../../common/cell-isolation/share-seo-cell.interceptor';

describe('ShareSeoController excluded-route cell isolation', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const workspaceRepo = {
      findByHostname: jest.fn().mockResolvedValue({
        id: 'foreign-workspace',
        cellId: 'us1',
      }),
      findFirst: jest.fn(),
    };
    const environmentService = {
      isCloud: () => true,
      isSelfHosted: () => false,
    };
    const built = await Test.createTestingModule({
      controllers: [ShareSeoController],
      providers: [
        { provide: ShareService, useValue: {} },
        { provide: WorkspaceRepo, useValue: workspaceRepo },
        { provide: EnvironmentService, useValue: environmentService },
        {
          provide: OrvexConfigService,
          useValue: new OrvexConfigService({ CELL_ID: 'eu1' }),
        },
        WorkspaceCellAssertionService,
        ShareSeoCellInterceptor,
      ],
    }).compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Production's documented global-prefix exclusion is the bypass under
    // test: this request reaches /share/... without DomainMiddleware.
    app.setGlobalPrefix('api', {
      exclude: ['share/:shareId/p/:pageSlug'],
    });
    app.useGlobalInterceptors(built.get(ShareSeoCellInterceptor));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refuses a foreign-cell request on the public share SEO route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/share/public-share/p/example-page',
      headers: { host: 'foreign.example.test' },
    });

    expect(response.statusCode).toBe(421);
    expect(response.json()).toEqual({
      errorCode: 'CELL_MISMATCH',
      message: 'This host does not serve the requested workspace; re-discover.',
      details: { cell: 'eu1', reResolve: { action: 'rediscover' } },
    });
  });
});
