// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createServer, RequestListener, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexConfigService } from '../config/orvex-config.service';
import { HttpBillingEntitlementPort } from './entitlement-http-billing.port';
import { BillingServiceCredentialProvider } from './billing-service-credential';
import { BillingUnconfiguredError } from './entitlement-billing.port';
import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { INTERIM_FREE_ENTITLEMENT } from './entitlement.types';
import {
  EntitlementUnavailableException,
  QuotaExceededException,
} from './quota.exception';

// Exercise owned config/adapter/credential/cache classes, with real loopback
// HTTP only. Synthetic credentials are checked as booleans, never printed.
const configModules: TestingModule[] = [];
async function environment(values: Record<string, string> = {}) {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        skipProcessEnv: true,
        load: [() => values],
      }),
    ],
    providers: [EnvironmentService],
  }).compile();
  configModules.push(module);
  return module.get(EnvironmentService);
}

function catalog() {
  return {
    ...INTERIM_FREE_ENTITLEMENT,
    caps: { ...INTERIM_FREE_ENTITLEMENT.caps, wiki_max_pages: 2 },
  };
}

function renderBilling(profile: string): string {
  const work = mkdtempSync(join(tmpdir(), 'wiki-billing-'));
  try {
    cpSync(resolve(__dirname, '../../../../../deploy/kustomize'), work, {
      recursive: true,
    });
    const crew = profile.startsWith('crew');
    const entry = profile === 'crew-env-yafet' ? join(work, 'crew-env') : work;
    if (crew) {
      const path = join(entry, 'cluster-config.yaml');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace(
          /^ {2}branchSlug: .*$/m,
          '  branchSlug: crew-yafet',
        ),
      );
    }
    const component =
      profile === 'dev'
        ? 'components/staging'
        : profile === 'crew-yafet'
          ? 'components/crew'
          : '';
    if (component) {
      const path = join(work, 'kustomization.yaml');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace(
          /^components:\n(?: {2}- .*\n)+/m,
          (list) => `${list}  - ${component}\n`,
        ),
      );
    }
    const yaml = execFileSync('kustomize', ['build', entry], {
      encoding: 'utf8',
    });
    const config = yaml
      .split(/^---\s*$/m)
      .find(
        (doc) =>
          /^kind: ConfigMap$/m.test(doc) &&
          /^ {2}name: orvex-wiki-env$/m.test(doc),
      );
    if (!config) throw new Error('actual runtime ConfigMap missing');
    if (/^ {2}ORVEX_BILLING_API_URL:/m.test(config))
      throw new Error('legacy billing provider remains');
    const value = config.match(/^ {2}ORVEX_BILLING_URL: (.+)$/m)?.[1];
    if (!value) throw new Error('canonical billing provider missing');
    return value.startsWith('"') ? JSON.parse(value) : value;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

describe('canonical billing config through real adapters', () => {
  const servers: Server[] = [];
  const originalFetch = global.fetch;
  let billingUrl: string, legacyUrl: string, identityUrl: string;
  let billingStatus: number, identityStatus: number, malformed: boolean;
  let billingPaths: string[], legacyCalls: number, mintCalls: number;
  let mintBody: unknown,
    mintPath: string,
    bearerMatches: boolean,
    assertionMatches: boolean;
  let clock: number;
  const tenant = 'tenant/a b?';
  const secret = 'synthetic-seam-fixture';
  const assertion = () =>
    `e30.${Buffer.from(JSON.stringify({ exp: clock / 1000 + 120, tenant, aud: 'orvex-studio-billing', scope: 'billing:read' })).toString('base64url')}.synthetic`;

  async function listen(handler: RequestListener): Promise<string> {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeEach(async () => {
    clock = Date.now();
    billingStatus = 200;
    identityStatus = 200;
    malformed = false;
    billingPaths = [];
    legacyCalls = 0;
    mintCalls = 0;
    mintBody = undefined;
    mintPath = '';
    bearerMatches = false;
    assertionMatches = false;
    billingUrl = await listen((req, res) => {
      billingPaths.push(req.url ?? '');
      assertionMatches = req.headers['x-orvex-assertion'] === assertion();
      res.writeHead(billingStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify(malformed ? {} : catalog()));
    });
    legacyUrl = await listen((_req, res) => {
      legacyCalls++;
      res.end('{}');
    });
    identityUrl = await listen(async (req, res) => {
      mintCalls++;
      mintPath = req.url ?? '';
      bearerMatches = req.headers.authorization === `Bearer ${secret}`;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      mintBody = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(identityStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ assertion: assertion() }));
    });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await Promise.all(configModules.splice(0).map((module) => module.close()));
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((done, reject) => {
            if (!server.listening) {
              done();
              return;
            }
            server.close((error) => (error ? reject(error) : done()));
            server.closeAllConnections();
          }),
      ),
    );
  });

  async function configured(
    values: Record<string, string>,
    credentials = true,
  ) {
    const provider = new BillingServiceCredentialProvider(
      new OrvexConfigService(
        credentials
          ? {
              ORVEX_IDENTITY_URL: `${identityUrl}/realm///`,
              INTERNAL_API_BEARER_TOKEN: secret,
            }
          : {},
      ),
      () => clock,
    );
    return new HttpBillingEntitlementPort(await environment(values), provider);
  }
  const principal = { principal_type: 'org' as const, principal_id: tenant };

  it.each([false, true])(
    'uses canonical input and exact encoded path; conflicting legacy=%s',
    async (conflict) => {
      const port = await configured({
        ORVEX_BILLING_URL: `${billingUrl}/prefix///`,
        ...(conflict ? { ORVEX_BILLING_API_URL: legacyUrl } : {}),
      });
      await expect(port.checkEntitlement(principal)).resolves.toMatchObject({
        caps: { wiki_max_pages: 2 },
      });
      expect(billingPaths).toEqual([
        `/prefix/v1/entitlements/org/${encodeURIComponent(tenant)}`,
      ]);
      expect(legacyCalls).toBe(0);
      expect(mintPath).toBe('/realm/internal/service-assertion');
      expect(mintBody).toEqual({ tenant, target: 'orvex-studio-billing' });
      expect(bearerMatches && assertionMatches).toBe(true);
      await port.checkEntitlement(principal);
      expect(mintCalls).toBe(1); // actual tenant credential cache
    },
  );

  it.each([undefined, ''])(
    'canonical %s with legacy-only URL stays unconfigured and Free',
    async (value) => {
      const values = {
        ORVEX_BILLING_API_URL: legacyUrl,
        ...(value === undefined ? {} : { ORVEX_BILLING_URL: value }),
      };
      const port = await configured(values);
      await expect(port.checkEntitlement(principal)).rejects.toBeInstanceOf(
        BillingUnconfiguredError,
      );
      const service = new EntitlementService(
        port,
        new InMemoryEntitlementCache(),
      );
      await expect(
        service.assertWithinQuota(tenant, 'pages', 199),
      ).resolves.toBeUndefined();
      await expect(
        service.assertWithinQuota(tenant, 'pages', 200),
      ).rejects.toBeInstanceOf(QuotaExceededException);
      expect(billingPaths).toHaveLength(0);
      expect(legacyCalls).toBe(0);
      expect(mintCalls).toBe(0);
    },
  );

  it.each([' ', 'not-a-url', '  http://example.invalid/path  '])(
    'preserves the raw nonempty getter value %j',
    async (value) => {
      expect(
        (await environment({ ORVEX_BILLING_URL: value })).getBillingApiUrl(),
      ).toBe(value);
    },
  );

  it('preserves optional unconfigured credential provider behavior', async () => {
    const port = await configured({ ORVEX_BILLING_URL: billingUrl }, false);
    await expect(port.checkEntitlement(principal)).resolves.toMatchObject({
      caps: { wiki_max_pages: 2 },
    });
    expect(mintCalls).toBe(0);
    expect(assertionMatches).toBe(false);
  });

  it('identity refusal makes no billing request and cold resolution remains 503', async () => {
    identityStatus = 403;
    const service = new EntitlementService(
      await configured({ ORVEX_BILLING_URL: billingUrl }),
      new InMemoryEntitlementCache(),
    );
    await expect(
      service.assertWithinQuota(tenant, 'pages', 0),
    ).rejects.toBeInstanceOf(EntitlementUnavailableException);
    expect(mintCalls).toBe(1);
    expect(billingPaths).toHaveLength(0);
  });

  it.each([401, 403, 421])(
    'billing %i evicts actual cached assertion and preserves cold 503',
    async (status) => {
      const port = await configured({ ORVEX_BILLING_URL: billingUrl });
      await port.checkEntitlement(principal);
      expect(mintCalls).toBe(1);
      billingStatus = status;
      const service = new EntitlementService(
        port,
        new InMemoryEntitlementCache(),
      );
      await expect(
        service.assertWithinQuota(tenant, 'pages', 0),
      ).rejects.toBeInstanceOf(EntitlementUnavailableException);
      expect(mintCalls).toBe(1);
      billingStatus = 200;
      await port.checkEntitlement(principal);
      expect(mintCalls).toBe(2);
    },
  );

  it('real credential expiry retains the existing reuse ceiling', async () => {
    const port = await configured({ ORVEX_BILLING_URL: billingUrl });
    await port.checkEntitlement(principal);
    clock += 91_000;
    await port.checkEntitlement(principal);
    expect(mintCalls).toBe(2);
  });

  it('configured malformed response stays 503; warm cache and quota402 remain distinct', async () => {
    const port = await configured({ ORVEX_BILLING_URL: billingUrl });
    const cache = new InMemoryEntitlementCache();
    const service = new EntitlementService(port, cache);
    await service.assertWithinQuota(tenant, 'pages', 1);
    malformed = true;
    await expect(
      service.assertWithinQuota(tenant, 'pages', 2),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    expect(billingPaths).toHaveLength(1); // real warm-cache path
    await cache.evict(principal);
    await expect(
      service.assertWithinQuota(tenant, 'pages', 0),
    ).rejects.toBeInstanceOf(EntitlementUnavailableException);
  });

  it('configured transport failure remains 503 rather than unconfigured Free', async () => {
    const port = await configured({ ORVEX_BILLING_URL: billingUrl }, false);
    await new Promise<void>((done) => servers[0].close(() => done()));
    const service = new EntitlementService(
      port,
      new InMemoryEntitlementCache(),
    );
    await expect(
      service.assertWithinQuota(tenant, 'pages', 0),
    ).rejects.toBeInstanceOf(EntitlementUnavailableException);
  });

  it.each(['base', 'dev', 'crew-yafet', 'crew-env-yafet'])(
    'actual %s rendered config reaches the same adapter and configured HTTP response',
    async (profile) => {
      const rendered = renderBilling(profile);
      const namespace =
        profile === 'base'
          ? 'orvex-studio-billing'
          : profile === 'dev'
            ? 'orvex-studio-billing-dev'
            : 'orvex-studio-billing-crew-yafet';
      const endpoint = `http://orvex-studio-billing.${namespace}.svc.cluster.local${profile.startsWith('crew') ? ':80' : ''}`;
      expect(rendered).toBe(endpoint);
      const env = await environment({ ORVEX_BILLING_URL: rendered });
      expect(env.getBillingApiUrl()).toBe(endpoint);
      // Only the external network connection is redirected to local HTTP. The
      // actual getter/adapter construct and expose the unchanged rendered URL.
      const requested: string[] = [];
      global.fetch = (async (input: string, init: RequestInit) => {
        requested.push(String(input));
        if (!String(input).startsWith(endpoint + '/'))
          throw new Error('unexpected external target');
        return originalFetch(
          billingUrl + String(input).slice(endpoint.length),
          init,
        );
      }) as typeof fetch;
      await expect(
        new HttpBillingEntitlementPort(env).checkEntitlement(principal),
      ).resolves.toMatchObject({ caps: { wiki_max_pages: 2 } });
      expect(requested).toEqual([
        `${endpoint}/v1/entitlements/org/${encodeURIComponent(tenant)}`,
      ]);
      expect(legacyCalls).toBe(0);
    },
  );
});
