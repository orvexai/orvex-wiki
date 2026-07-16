/**
 * StaticModule SPA-catch-all guard (regression for the MCP
 * "unexpected shape from block GET" defect).
 *
 * The engine mounts a Fastify `app.get('*')` catch-all that streams the SPA
 * shell (client/dist/index.html) so client-side routing works on hard reloads.
 * Before the guard, that catch-all also swallowed EVERY unmatched request under
 * the global `/api` prefix — an `/api/pages/{id}/blocks/{blockId}` GET that no
 * NestJS controller claims fell through and returned index.html as HTTP 200
 * text/html. JSON clients (the MCP backstage wrapper) parsed the HTML as the
 * block body and failed with an opaque "unexpected shape from block GET".
 *
 * These tests exercise the ACTUAL handler registered by onModuleInit():
 *  - an unmatched `/api/...` GET must return a JSON 404 (loud, honest);
 *  - a genuine SPA / client-routing path must still get the index.html shell.
 */

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => '<!--window-config-->'),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  createReadStream: jest.fn(() => ({ __fakeStream: true })),
}));

jest.mock('@fastify/static', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { StaticModule } from './static.module';

type CapturedHandler = (req: any, res: any) => void;

function makeRes() {
  const res: any = {
    _status: undefined,
    _type: undefined,
    _sent: undefined,
    status: jest.fn(function (this: any, code: number) {
      res._status = code;
      return res;
    }),
    type: jest.fn(function (this: any, t: string) {
      res._type = t;
      return res;
    }),
    header: jest.fn(function () {
      return res;
    }),
    send: jest.fn(function (this: any, body: any) {
      res._sent = body;
      return res;
    }),
  };
  return res;
}

async function bootHandler(): Promise<CapturedHandler> {
  let captured: CapturedHandler | undefined;
  const app = {
    register: jest.fn(async () => undefined),
    get: jest.fn((path: string, handler: CapturedHandler) => {
      if (path === '*') captured = handler;
    }),
  };
  const httpAdapterHost: any = {
    httpAdapter: { getInstance: () => app },
  };
  const environmentService: any = {
    getNodeEnv: () => 'test',
    getAppUrl: () => 'https://wiki.example',
    isCloud: () => true,
    getFileUploadSizeLimit: () => 1,
    getFileImportSizeLimit: () => 1,
    getDrawioUrl: () => '',
    getSubdomainHost: () => 'example',
    getCollabUrl: () => '',
    getBillingTrialDays: () => 0,
    getPostHogHost: () => '',
    getPostHogKey: () => '',
  };

  const mod = new StaticModule(httpAdapterHost, environmentService);
  await mod.onModuleInit();
  if (!captured) throw new Error('catch-all handler was not registered');
  return captured;
}

describe('StaticModule SPA catch-all', () => {
  it('returns a JSON 404 for an unmatched /api block GET (no SPA leak)', async () => {
    const handler = await bootHandler();
    const res = makeRes();
    handler(
      { raw: { url: '/api/pages/abc/blocks/def?format=dfm' } },
      res,
    );

    expect(res._status).toBe(404);
    expect(res._type).toBe('application/json');
    expect(res._sent).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    });
  });

  it('returns a JSON 404 for any unmatched /api GET', async () => {
    const handler = await bootHandler();
    const res = makeRes();
    handler({ raw: { url: '/api/nonexistent-route' } }, res);

    expect(res._status).toBe(404);
    expect(res._type).toBe('application/json');
  });

  it('still serves the SPA shell for a client-routing path', async () => {
    const handler = await bootHandler();
    const res = makeRes();
    handler({ raw: { url: '/s/space/p/slug' } }, res);

    expect(res._status).toBeUndefined();
    expect(res._type).toBe('text/html');
    expect(res._sent).toEqual({ __fakeStream: true });
  });

  it('does not misfire on a path that merely contains "api"', async () => {
    const handler = await bootHandler();
    const res = makeRes();
    handler({ raw: { url: '/capitals' } }, res);

    expect(res._type).toBe('text/html');
    expect(res._status).toBeUndefined();
  });
});
