import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { getCorrelationContext } from './context';

const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'loop';

// Map Pino log levels to OpenTelemetry severity numbers
const pinoLevelToOtelSeverity: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE, // trace
  20: SeverityNumber.DEBUG, // debug
  30: SeverityNumber.INFO, // info
  40: SeverityNumber.WARN, // warn
  50: SeverityNumber.ERROR, // error
  60: SeverityNumber.FATAL // fatal
};

/**
 * Mixin that adds trace context to every log entry
 */
const traceMixin = () => {
  const mixinData: Record<string, string | undefined> = {};

  // Add OpenTelemetry trace context
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    mixinData.trace_id = spanContext.traceId;
    mixinData.span_id = spanContext.spanId;
  }

  // Add correlation context
  const correlationCtx = getCorrelationContext();
  if (correlationCtx) {
    mixinData.correlation_id = correlationCtx.correlationId;
    if (correlationCtx.merchantId) mixinData.merchant_id = correlationCtx.merchantId;
    if (correlationCtx.orderId) mixinData.order_id = correlationCtx.orderId;
    if (correlationCtx.workflowId) mixinData.workflow_id = correlationCtx.workflowId;
  }

  return mixinData;
};

/**
 * Custom destination that sends logs to both stdout and OpenTelemetry
 */
function createOtelDestination() {
  const stdout = pino.destination(1); // stdout

  return {
    write(msg: string) {
      // Write to stdout
      stdout.write(msg);

      // Parse and send to OpenTelemetry
      try {
        const logRecord = JSON.parse(msg);
        const otelLogger = logs.getLogger(SERVICE_NAME);

        // Extract trace context
        const span = trace.getActiveSpan();
        const spanContext = span?.spanContext();

        otelLogger.emit({
          severityNumber: pinoLevelToOtelSeverity[logRecord.level] || SeverityNumber.INFO,
          severityText: pino.levels.labels[logRecord.level] || 'INFO',
          body: logRecord.msg,
          attributes: {
            ...logRecord,
            // Remove fields that are part of the log record structure
            msg: undefined,
            level: undefined,
            time: undefined
          },
          timestamp: logRecord.time ? new Date(logRecord.time).getTime() * 1000000 : Date.now() * 1000000, // nanoseconds
          ...(spanContext && {
            spanId: spanContext.spanId,
            traceId: spanContext.traceId,
            traceFlags: spanContext.traceFlags
          })
        });
      } catch {
        // Ignore parse errors - just write to stdout
      }
    }
  };
}

/**
 * Base logger with trace context mixin
 * In development: pretty print to console + OTLP
 * In production: JSON to stdout + OTLP
 */
export const logger = pino(
  {
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    mixin: traceMixin,
    base: {
      service: SERVICE_NAME,
      env: NODE_ENV
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // In development, use pino-pretty for console but also send to OTLP
    ...(NODE_ENV !== 'production' && {
      transport: {
        targets: [
          {
            target: 'pino-pretty',
            options: { colorize: true },
            level: 'debug'
          },
          {
            target: 'pino/file',
            options: { destination: 1 }, // stdout for OTLP bridge
            level: 'debug'
          }
        ]
      }
    })
  },
  // In production, use the OTLP destination
  NODE_ENV === 'production' ? createOtelDestination() : undefined
);

// Also emit logs via OTLP when using transport in development
if (NODE_ENV !== 'production') {
  // Hook into pino's write to also send to OTLP
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = '';

  process.stdout.write = function (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();

    // Accumulate and process JSON logs
    buffer += str;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('{') && line.includes('"level"')) {
        try {
          const logRecord = JSON.parse(line);
          const otelLogger = logs.getLogger(SERVICE_NAME);

          otelLogger.emit({
            severityNumber: pinoLevelToOtelSeverity[logRecord.level] || SeverityNumber.INFO,
            severityText: pino.levels.labels[logRecord.level] || 'INFO',
            body: logRecord.msg,
            attributes: {
              service: logRecord.service,
              env: logRecord.env,
              trace_id: logRecord.trace_id,
              span_id: logRecord.span_id,
              correlation_id: logRecord.correlation_id,
              merchant_id: logRecord.merchant_id,
              order_id: logRecord.order_id,
              workflow_id: logRecord.workflow_id
            },
            timestamp: logRecord.time ? new Date(logRecord.time).getTime() * 1000000 : Date.now() * 1000000
          });
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Call original with proper overload handling
    if (typeof encodingOrCallback === 'function') {
      return originalWrite(chunk, encodingOrCallback);
    } else if (encodingOrCallback) {
      return originalWrite(chunk, encodingOrCallback, callback);
    }
    return originalWrite(chunk);
  };
}

/**
 * Create a child logger for a specific activity
 */
export function createActivityLogger(activityName: string, correlationId?: string) {
  return logger.child({
    activity: activityName,
    correlationId
  });
}

/**
 * Create a child logger for a specific workflow
 */
export function createWorkflowLogger(workflowId: string, correlationId?: string) {
  return logger.child({
    workflowId,
    correlationId
  });
}

/**
 * Create a child logger for HTTP requests
 */
export function createRequestLogger(requestId: string, method: string, path: string) {
  return logger.child({
    requestId,
    method,
    path
  });
}
