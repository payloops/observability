// OpenTelemetry
export { initTelemetry, shutdownTelemetry, type TelemetryConfig } from './lib/otel';

// Logger
export { logger, createActivityLogger, createWorkflowLogger, createRequestLogger } from './lib/logger';

// Correlation Context
export {
  getCorrelationContext,
  withCorrelationContext,
  withCorrelationContextAsync,
  generateCorrelationId,
  extractCorrelationId,
  createPropagationHeaders,
  createContextFromMemo,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  type CorrelationContext
} from './lib/context';

// Metrics
export {
  // Payment metrics
  paymentCounter,
  paymentAmountHistogram,
  paymentLatencyHistogram,
  recordPaymentAttempt,
  recordPaymentAmount,
  recordPaymentLatency,

  // Webhook metrics
  webhookDeliveryCounter,
  webhookLatencyHistogram,
  recordWebhookDelivery,
  recordWebhookLatency,

  // HTTP metrics
  httpRequestCounter,
  httpRequestLatencyHistogram,
  activeRequestsGauge,
  recordHttpRequest,

  // Database metrics
  dbQueryHistogram,
  dbConnectionGauge,

  // Workflow metrics
  workflowStartedCounter,
  workflowCompletedCounter,
  workflowFailedCounter,
  activityLatencyHistogram,
  recordWorkflowStarted,
  recordWorkflowCompleted,
  recordWorkflowFailed,
  recordActivityLatency
} from './lib/metrics';
