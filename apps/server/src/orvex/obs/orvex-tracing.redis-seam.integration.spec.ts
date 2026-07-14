// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { execFileSync } from 'child_process';
import { join } from 'path';

import { GenericContainer, StartedTestContainer } from 'testcontainers';

/**
 * ENG-1599 §5b seam coverage (AC1) — integration. Real `ioredis` client
 * against a real Redis (a plain `GenericContainer`, the SAME pattern already
 * used by `upsert-dedup.integration.spec.ts` — no NEW testcontainers
 * introduced by this leg, CS §4f), driven through the SDK's real
 * `IORedisInstrumentation` (no mock of the instrumentation, CS §5/❌#4).
 *
 * Runs the drive-and-assert step in a SEPARATE, real Node process (see
 * `__fixtures__/redis-seam-probe.ts`) rather than in-process under Jest:
 * OTel's Node auto-instrumentation relies on `require-in-the-middle` hooking
 * `Module._load`, which Jest's own module registry does not reliably
 * support — a documented environment limitation, not a defect in
 * `initOrvexTracing`. This still asserts the REAL production code path; only
 * the test HARNESS is out-of-process.
 */
describe('orvex-tracing — Redis (ioredis) seam coverage', () => {
  jest.setTimeout(120_000);

  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
  });

  afterAll(async () => {
    await redisContainer?.stop();
  });

  it('a Redis op produces a child span under the active server span', () => {
    const probeScript = join(__dirname, '__fixtures__/redis-seam-probe.ts');

    const stdout = execFileSync(
      'node',
      ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', probeScript],
      {
        cwd: join(__dirname, '../../..'),
        encoding: 'utf-8',
        env: {
          ...process.env,
          PROBE_REDIS_HOST: redisContainer.getHost(),
          PROBE_REDIS_PORT: String(redisContainer.getMappedPort(6379)),
        },
      },
    );

    const spans = stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { name: string; spanId: string; parentSpanId: string | null });

    const server = spans.find((s) => s.name === 'server-span');
    expect(server).toBeDefined();

    const redisSpans = spans.filter((s) => s.parentSpanId === server!.spanId);
    expect(redisSpans.length).toBeGreaterThan(0);
  });
});
