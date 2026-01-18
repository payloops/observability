import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { getCorrelationContext } from './context';

const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'loop';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

// ANSI colors for pretty console output
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const levelConfig: Record<string, { severity: SeverityNumber; color: string; label: string; priority: number }> = {
  trace: { severity: SeverityNumber.TRACE, color: colors.dim, label: 'TRACE', priority: 0 },
  debug: { severity: SeverityNumber.DEBUG, color: colors.blue, label: 'DEBUG', priority: 1 },
  info: { severity: SeverityNumber.INFO, color: colors.green, label: 'INFO', priority: 2 },
  warn: { severity: SeverityNumber.WARN, color: colors.yellow, label: 'WARN', priority: 3 },
  error: { severity: SeverityNumber.ERROR, color: colors.red, label: 'ERROR', priority: 4 },
  fatal: { severity: SeverityNumber.FATAL, color: colors.magenta, label: 'FATAL', priority: 5 }
};

const currentLevelPriority = levelConfig[LOG_LEVEL]?.priority ?? 2;

/**
 * Get trace and correlation context for log enrichment
 */
function getContext(): Record<string, string | undefined> {
  const ctx: Record<string, string | undefined> = {};

  // Add OpenTelemetry trace context
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    ctx.trace_id = spanContext.traceId;
    ctx.span_id = spanContext.spanId;
  }

  // Add correlation context
  const correlationCtx = getCorrelationContext();
  if (correlationCtx) {
    ctx.correlation_id = correlationCtx.correlationId;
    if (correlationCtx.merchantId) ctx.merchant_id = correlationCtx.merchantId;
    if (correlationCtx.orderId) ctx.order_id = correlationCtx.orderId;
    if (correlationCtx.workflowId) ctx.workflow_id = correlationCtx.workflowId;
  }

  return ctx;
}

/**
 * Emit log to OpenTelemetry
 */
function emitToOtel(level: string, message: string, attributes: Record<string, unknown>) {
  try {
    const provider = logs.getLoggerProvider();
    if (provider.constructor.name === 'ProxyLoggerProvider') {
      return; // OTel not initialized yet
    }

    const otelLogger = provider.getLogger(SERVICE_NAME);
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();
    const config = levelConfig[level];

    otelLogger.emit({
      severityNumber: config?.severity ?? SeverityNumber.INFO,
      severityText: config?.label ?? 'INFO',
      body: message,
      attributes: {
        service: SERVICE_NAME,
        env: NODE_ENV,
        ...attributes
      },
      // Don't set timestamp - let OTel SDK use current time automatically
      ...(spanContext && {
        spanId: spanContext.spanId,
        traceId: spanContext.traceId,
        traceFlags: spanContext.traceFlags
      })
    });
  } catch {
    // Don't break logging if OTel fails
  }
}

/**
 * Format log for console output
 */
function formatConsole(level: string, message: string, data: Record<string, unknown>): string {
  const config = levelConfig[level];
  const timestamp = new Date().toISOString();
  const color = config?.color ?? colors.reset;
  const label = config?.label ?? level.toUpperCase();

  if (NODE_ENV === 'production') {
    // JSON format for production
    return JSON.stringify({
      time: timestamp,
      level: label,
      msg: message,
      service: SERVICE_NAME,
      env: NODE_ENV,
      ...data
    });
  }

  // Pretty format for development
  const timeStr = `${colors.dim}[${timestamp.split('T')[1].slice(0, -1)}]${colors.reset}`;
  const levelStr = `${color}${label.padEnd(5)}${colors.reset}`;
  const msgStr = `${color}${message}${colors.reset}`;

  const dataEntries = Object.entries(data).filter(([, v]) => v !== undefined);
  const dataStr = dataEntries.length > 0
    ? '\n' + dataEntries.map(([k, v]) => `    ${colors.magenta}${k}${colors.reset}: ${JSON.stringify(v)}`).join('\n')
    : '';

  return `${timeStr} ${levelStr}: ${msgStr}${dataStr}`;
}

/**
 * Core log function
 */
function log(level: string, msgOrData: string | Record<string, unknown>, msg?: string) {
  const config = levelConfig[level];
  if (!config || config.priority < currentLevelPriority) {
    return;
  }

  let message: string;
  let data: Record<string, unknown>;

  if (typeof msgOrData === 'string') {
    message = msgOrData;
    data = {};
  } else {
    message = msg ?? '';
    data = msgOrData;
  }

  // Add trace/correlation context
  const context = getContext();
  const enrichedData = { ...data, ...context };

  // Output to console
  console.log(formatConsole(level, message, enrichedData));

  // Send to OTel
  emitToOtel(level, message, enrichedData);
}

export interface Logger {
  trace(msg: string): void;
  trace(data: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(data: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(data: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(data: Record<string, unknown>, msg: string): void;
  fatal(msg: string): void;
  fatal(data: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Create a logger instance with optional default bindings
 */
function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const boundLog = (level: string, msgOrData: string | Record<string, unknown>, msg?: string) => {
    if (typeof msgOrData === 'string') {
      log(level, { ...bindings }, msgOrData);
    } else {
      log(level, { ...bindings, ...msgOrData }, msg);
    }
  };

  return {
    trace: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('trace', msgOrData, msg),
    debug: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('debug', msgOrData, msg),
    info: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('info', msgOrData, msg),
    warn: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('warn', msgOrData, msg),
    error: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('error', msgOrData, msg),
    fatal: (msgOrData: string | Record<string, unknown>, msg?: string) => boundLog('fatal', msgOrData, msg),
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings })
  };
}

/**
 * Base logger instance
 */
export const logger = createLogger({ service: SERVICE_NAME, env: NODE_ENV });

/**
 * Create a child logger for a specific activity
 */
export function createActivityLogger(activityName: string, correlationId?: string) {
  return logger.child({ activity: activityName, correlationId });
}

/**
 * Create a child logger for a specific workflow
 */
export function createWorkflowLogger(workflowId: string, correlationId?: string) {
  return logger.child({ workflowId, correlationId });
}

/**
 * Create a child logger for HTTP requests
 */
export function createRequestLogger(requestId: string, method: string, path: string) {
  return logger.child({ requestId, method, path });
}
