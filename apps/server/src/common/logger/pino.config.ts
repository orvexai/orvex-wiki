import { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import { trace } from '@opentelemetry/api';
import { redactSensitiveUrl } from '../helpers/utils';
import { getActiveCorrelationId } from '../../orvex/obs/orvex-correlation.hook';

const CONTEXTS_TO_IGNORE = [
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'LegacyRouteConverter',
  'WebSocketsController',
];

/**
 * ENG-1599 AC3 (log<->trace join) + AC5 (byte-parity): stamps `trace_id`/
 * `span_id`/`correlation_id` on every pino line while a span is active.
 * `trace.getActiveSpan()` is the OTel API's own no-op-safe call — it resolves
 * to `undefined` whenever no SDK is initialized (`ORVEX_MODULES_ENABLED`
 * off, or the OTel endpoint unset) or no span is active in the current
 * context, in which case this returns `{}` and stamps NONE of these keys —
 * vanilla-safe by construction, not by a flag check here.
 */
export function buildOrvexTraceMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }

  const spanContext = span.spanContext();
  const fields: Record<string, string> = {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };

  const correlationId = getActiveCorrelationId();
  if (correlationId) {
    fields.correlation_id = correlationId;
  }

  return fields;
}

export function createPinoConfig(): Params {
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';
  const isDebugMode = process.env.DEBUG_MODE?.toLowerCase() === 'true';
  const logHttp = process.env.LOG_HTTP?.toLowerCase() === 'true';

  const level = isProduction && !isDebugMode ? 'info' : 'debug';

  return {
    pinoHttp: {
      level,
      timestamp: stdTimeFunctions.isoTime,
      mixin: buildOrvexTraceMixin,
      transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      formatters: {
        level: (label) => ({ level: label }),
      },
      hooks: {
        logMethod(inputArgs, method) {
          if (isProduction && !isDebugMode) {
            for (const arg of inputArgs) {
              if (typeof arg === 'object' && arg !== null && 'context' in arg) {
                const context = (arg as Record<string, unknown>)['context'];
                if (typeof context === 'string' && CONTEXTS_TO_IGNORE.includes(context)) {
                  return;
                }
              }
            }
          }
          return method.apply(this, inputArgs);
        },
      },
      serializers: {
        req: (req) => ({
          method: req.method,
          url: redactSensitiveUrl(req.url),
          ip: req.ip || req.remoteAddress,
          userAgent: req.headers?.['user-agent'],
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: logHttp
        ? {
            ignore: (req) =>
              req.url === '/api/health' || req.url === '/api/health/live',
          }
        : false,
    },
  };
}
