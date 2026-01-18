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
 * Emit a log record to OpenTelemetry
 * Note: We get a fresh logger reference each time to ensure we're using the
 * real LoggerProvider after initTelemetry() has been called, not the ProxyLoggerProvider.
 */
function emitToOtel(logRecord: Record<string, unknown>) {
  try {
    // Check if a real LoggerProvider has been set up
    // ProxyLoggerProvider is the default no-op provider
    const provider = logs.getLoggerProvider();
    if (provider.constructor.name === 'ProxyLoggerProvider') {
      // initTelemetry hasn't been called yet, skip OTLP emission
      return;
    }

    const otelLogger = provider.getLogger(SERVICE_NAME);

    // Extract trace context
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();

    otelLogger.emit({
      severityNumber: pinoLevelToOtelSeverity[logRecord.level as number] || SeverityNumber.INFO,
      severityText: pino.levels.labels[logRecord.level as number] || 'INFO',
      body: logRecord.msg as string,
      attributes: {
        ...logRecord,
        // Remove fields that are part of the log record structure
        msg: undefined,
        level: undefined,
        time: undefined
      },
      timestamp: logRecord.time ? new Date(logRecord.time as string).getTime() * 1000000 : Date.now() * 1000000, // nanoseconds
      ...(spanContext && {
        spanId: spanContext.spanId,
        traceId: spanContext.traceId,
        traceFlags: spanContext.traceFlags
      })
    });
  } catch {
    // Ignore errors - don't break logging
  }
}

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
        emitToOtel(logRecord);
      } catch {
        // Ignore parse errors - just write to stdout
      }
    }
  };
}

/**
 * Custom hook that emits logs to OTLP before they're written
 */
const otelHooks = {
  logMethod(
    this: pino.Logger,
    inputArgs: Parameters<pino.LogFn>,
    method: pino.LogFn,
    level: number
  ) {
    // Call the original method first
    method.apply(this, inputArgs);

    // Then emit to OTLP
    const [objOrMsg, msgOrUndefined] = inputArgs;
    const logRecord: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      service: SERVICE_NAME,
      env: NODE_ENV
    };

    // Handle different call signatures: logger.info(obj, msg) or logger.info(msg)
    if (typeof objOrMsg === 'object' && objOrMsg !== null) {
      Object.assign(logRecord, objOrMsg);
      logRecord.msg = msgOrUndefined || '';
    } else {
      logRecord.msg = objOrMsg;
    }

    // Add mixin data (trace context, correlation context)
    Object.assign(logRecord, traceMixin());

    emitToOtel(logRecord);
  }
};

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
    hooks: otelHooks,
    // In development, use pino-pretty for console output
    ...(NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    })
  },
  // In production, also write JSON to stdout (in addition to OTLP via hooks)
  NODE_ENV === 'production' ? pino.destination(1) : undefined
);

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
