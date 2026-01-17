import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { getCorrelationContext } from './context';

const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'loop';

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
 * Base logger with trace context mixin
 */
export const logger = pino({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  mixin: traceMixin,
  base: {
    service: SERVICE_NAME,
    env: NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined
});

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
