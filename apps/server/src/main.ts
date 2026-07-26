import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { TransformHttpResponseInterceptor } from './common/interceptors/http-response.interceptor';
import { WsRedisIoAdapter } from './ws/adapter/ws-redis.adapter';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyIp from 'fastify-ip';
import { InternalLogFilter } from './common/logger/internal-log-filter';
import { EnvironmentService } from './integrations/environment/environment.service';
import { resolveFrameHeader } from './common/helpers';
import { initOrvexTracing } from './orvex/obs/orvex-tracing.bootstrap';
import { resolveGlobalPrefixExclude } from './orvex/http/orvex-global-prefix-exclude';

async function bootstrap() {
  // ENG-1599: the OTel SDK MUST patch (http/fastify/ioredis instrumentation)
  // BEFORE the instrumented modules' real usage begins — flag+endpoint gated
  // (VANILLA BYTE-PARITY DOCTRINE, AC5); a no-op when either is unset/off, so
  // this line changes nothing about the vanilla boot path. The returned
  // ShutdownHandle is intentionally not held here: graceful flush (§4i) is
  // wired through OrvexTracingModule#onApplicationShutdown, which
  // `app.enableShutdownHooks()` below already invokes on SIGTERM/SIGINT via
  // the handle-free `shutdownOrvexTracing()` seam (see orvex-tracing.bootstrap.ts).
  initOrvexTracing(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      routerOptions: {
        maxParamLength: 1000,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
    }),
    {
      rawBody: true,
      // captures NestJS internal errors
      logger: new InternalLogFilter(),
      // bufferLogs must be false else pino will fail
      // to log OnApplicationBootstrap logs
      bufferLogs: false,
    },
  );

  app.useLogger(app.get(PinoLogger));

  // ENG-1604 AC8.4 — env-driven (ORVEX_GLOBAL_PREFIX_EXCLUDE), defaults to
  // the upstream exclusions + health/orvex.
  app.setGlobalPrefix('api', {
    exclude: resolveGlobalPrefixExclude(),
  });

  const reflector = app.get(Reflector);
  const redisIoAdapter = new WsRedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.register(fastifyIp);
  await app.register(fastifyMultipart);
  await app.register(fastifyCookie);

  const environmentService = app.get(EnvironmentService);
  const frameHeader = resolveFrameHeader(
    environmentService.isIframeEmbedAllowed(),
    environmentService.getIframeAllowedOrigins(),
  );
  if (frameHeader) {
    // Skipped routes:
    //   /api/files/ - attachment controller sets its own CSP we'd overwrite
    //   /share/     0 public share pages are safe to embed
    const frameHeaderSkippedPrefixes = ['/api/files/', '/share/'];
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onSend', (req, reply, payload, done) => {
        if (frameHeaderSkippedPrefixes.some((p) => req.url.startsWith(p))) {
          return done(null, payload);
        }
        reply.header(frameHeader.name, frameHeader.value);
        done(null, payload);
      });
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, _reply, done) => {
      (request.raw as any).ip = request.ip;
      done();
    });

  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'application/scim+json',
      { parseAs: 'string' },
      (_, body, done) => {
        try {
          const json = JSON.parse(body.toString());
          done(null, json);
        } catch (err: any) {
          done(err);
        }
      },
    );

  app
    .getHttpAdapter()
    .getInstance()
    .decorateReply('setHeader', function (name: string, value: unknown) {
      this.header(name, value);
    })
    .decorateReply('end', function () {
      this.send('');
    })
    .addHook('preHandler', function (req, reply, done) {
      // don't require workspaceId for the following paths
      const excludedPaths = [
        '/api/auth/setup',
        '/api/health',
        '/api/billing/stripe/webhook',
        '/api/workspace/check-hostname',
        '/api/sso/google',
        '/api/workspace/create',
        '/api/workspace/joined',
        '/api/workspace/find-by-email',
        // ENG-1559 FR-W6 — the public engine session-mint ESTABLISHES the
        // session from the identity exchange token carried in the request body;
        // it resolves the tenant by introspecting that token, never from a
        // host-resolved workspace, so (like /api/auth/setup + /api/workspace/*
        // above) it must not require a pre-resolved workspaceId. Without this,
        // CLOUD mode (no host->workspace match, no bearer yet) 404s the mint
        // before it can run.
        '/api/orvex/session/exchange',
        // ENG-1578 — the WHOLE tenant-move surface (`/api/orvex/tenant-move`
        // bare, the real registry cross-cell relocation, M14 closing gate
        // AC6, AND its `/quiesce`/`/export`/`/import`/`/activate` A-MOVE
        // sub-routes) resolves its caller by bearer (introspection or the
        // manifest's own `Idempotency-Key`-gated contract), NEVER from a
        // host-resolved workspace — the SAME shape as the FR-W6 session-
        // exchange exemption above, for the SAME reason. It is called over
        // a bare cluster-internal ClusterIP URL with no tenant-specific
        // Host header (orvex-studio-lib's M14 rehearsal harness, and any
        // real production caller e.g. orvex-workflows' TenantMoveWorkflow),
        // so without this exemption CLOUD mode 404s "Workspace not found"
        // before the tenant-move service's own auth even runs (confirmed
        // live against the deployed orvex-wiki-dev cell — the bare 200 gate
        // is a REAL cross-tenant relocation, so leaving it host-scoped by
        // accident is not an option: the bearer/moveId contract IS the
        // access control here, deliberately, not Host-based routing).
        '/api/orvex/tenant-move',
      ];

      if (
        req.originalUrl.startsWith('/api') &&
        !excludedPaths.some((path) => req.originalUrl.startsWith(path))
      ) {
        if (!req.raw?.['workspaceId'] && req.originalUrl !== '/api') {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(reflector));
  app.enableShutdownHooks();

  const logger = new Logger('NestApplication');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`UnhandledRejection, reason: ${reason}`, promise);
  });

  process.on('uncaughtException', (error) => {
    logger.error('UncaughtException:', error);
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host, () => {
    logger.log(
      `Listening on http://127.0.0.1:${port} / ${process.env.APP_URL}`,
    );
  });
}

bootstrap();
