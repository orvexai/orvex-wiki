// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrvexMetricsService } from '@orvexai/metrics';
import { FastifyReply, FastifyRequest } from 'fastify';

import { MetricsController } from './metrics.controller';
import { METRICS_AUTH_CONFIG, readMetricsAuthConfig } from './metrics-auth';

/**
 * MetricsController — HTTP handler tests (ENG-1360, T3/T4).
 *
 * Deliberately uses the REAL OrvexMetricsService (own package — §4f/❌#4
 * forbids mocking it): TC1.9.4/AC3/AC7 assert against whatever the real
 * service renders, never a hard-coded family list.
 */
describe('MetricsController', () => {
  const buildController = (env: Record<string, string | undefined>) => {
    return Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: OrvexMetricsService, useValue: new OrvexMetricsService() },
        {
          provide: METRICS_AUTH_CONFIG,
          useValue: readMetricsAuthConfig(env),
        },
      ],
    }).compile();
  };

  const fakeReply = () => {
    const headers: Record<string, string> = {};
    return {
      header: jest.fn((key: string, value: string) => {
        headers[key] = value;
        return undefined;
      }),
      send: jest.fn(),
      _headers: headers,
    };
  };

  // TC1.9.1 — fail-closed: neither env var set => 401, body never sent (AC4).
  it('TC1.9.1 — throws UnauthorizedException when neither CIDR nor bearer configured', async () => {
    const moduleRef = await buildController({});
    const controller = moduleRef.get(MetricsController);
    const reply = fakeReply();

    await expect(
      controller.getMetrics(
        { ip: '10.1.2.3', headers: {} } as unknown as FastifyRequest,
        reply as unknown as FastifyReply,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(reply.send).not.toHaveBeenCalled();
  });

  // AC1/AC2 — authorized bearer request: 200 body + Prometheus content-type.
  it('AC1/AC2 — returns 200 exposition body with the Prometheus content-type given a valid bearer', async () => {
    const moduleRef = await buildController({
      METRICS_BEARER_TOKEN: 'secret',
    });
    const controller = moduleRef.get(MetricsController);
    const service = moduleRef.get(OrvexMetricsService);
    const reply = fakeReply();

    await controller.getMetrics(
      {
        ip: '203.0.113.9',
        headers: { authorization: 'Bearer secret' },
      } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    );

    expect(reply.header).toHaveBeenCalledWith(
      'Content-Type',
      service.getContentType(),
    );
    expect(reply._headers['Content-Type']).toMatch(/text\/plain/);
    expect(reply._headers['Content-Type']).toMatch(/version=0\.0\.4/);
    expect(reply.send).toHaveBeenCalledWith(await service.getMetrics());
  });

  // TC1.9.4/AC3/AC7 — every family the REAL registry renders is present;
  // registry-agnostic (no hard-coded subset). Nine at HEAD.
  it('TC1.9.4 — renders every "# HELP orvex_*" family the real registry exposes', async () => {
    const moduleRef = await buildController({
      METRICS_BEARER_TOKEN: 'secret',
    });
    const controller = moduleRef.get(MetricsController);
    const service = moduleRef.get(OrvexMetricsService);
    const reply = fakeReply();

    // Prove registry-agnosticism honestly: derive the expected family names
    // from the real service's own registry (never a hard-coded list here).
    const expectedBody = await service.getMetrics();
    const expectedFamilies = [
      ...expectedBody.matchAll(/^# HELP (orvex_\S+)/gm),
    ].map((m) => m[1]);
    expect(expectedFamilies.length).toBeGreaterThanOrEqual(9);

    await controller.getMetrics(
      {
        ip: '203.0.113.9',
        headers: { authorization: 'Bearer secret' },
      } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    );

    const sentBody = reply.send.mock.calls[0][0] as string;
    for (const family of expectedFamilies) {
      expect(sentBody).toContain(`# HELP ${family}`);
    }
  });

  it('AC5 — CIDR path: 200 for an in-range IP, 401 for an out-of-range IP', async () => {
    const moduleRef = await buildController({
      METRICS_ALLOWED_CIDRS: '10.0.0.0/8',
    });
    const controller = moduleRef.get(MetricsController);

    const okReply = fakeReply();
    await controller.getMetrics(
      { ip: '10.1.2.3', headers: {} } as unknown as FastifyRequest,
      okReply as unknown as FastifyReply,
    );
    expect(okReply.send).toHaveBeenCalled();

    const deniedReply = fakeReply();
    await expect(
      controller.getMetrics(
        { ip: '192.168.0.1', headers: {} } as unknown as FastifyRequest,
        deniedReply as unknown as FastifyReply,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(deniedReply.send).not.toHaveBeenCalled();
  });

  it('does not perform any I/O beyond metrics.getMetrics() (AC-honesty/T5)', async () => {
    const moduleRef = await buildController({
      METRICS_BEARER_TOKEN: 'secret',
    });
    const controller = moduleRef.get(MetricsController);
    const service = moduleRef.get(OrvexMetricsService);
    const spy = jest.spyOn(service, 'getMetrics');
    const reply = fakeReply();

    await controller.getMetrics(
      {
        ip: '203.0.113.9',
        headers: { authorization: 'Bearer secret' },
      } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    );

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
