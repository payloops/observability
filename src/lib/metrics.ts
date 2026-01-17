import { metrics, ValueType } from '@opentelemetry/api';

// Create a meter for the application
const meter = metrics.getMeter('payloops');

// =============================================================================
// Payment Metrics
// =============================================================================

export const paymentCounter = meter.createCounter('payments_total', {
  description: 'Total number of payment attempts',
  valueType: ValueType.INT
});

export const paymentAmountHistogram = meter.createHistogram('payment_amount', {
  description: 'Distribution of payment amounts',
  unit: 'cents',
  valueType: ValueType.INT
});

export const paymentLatencyHistogram = meter.createHistogram('payment_latency_ms', {
  description: 'Payment processing latency',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

// =============================================================================
// Webhook Metrics
// =============================================================================

export const webhookDeliveryCounter = meter.createCounter('webhook_deliveries_total', {
  description: 'Total webhook delivery attempts',
  valueType: ValueType.INT
});

export const webhookLatencyHistogram = meter.createHistogram('webhook_latency_ms', {
  description: 'Webhook delivery latency',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

// =============================================================================
// HTTP Metrics
// =============================================================================

export const httpRequestCounter = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
  valueType: ValueType.INT
});

export const httpRequestLatencyHistogram = meter.createHistogram('http_request_latency_ms', {
  description: 'HTTP request latency',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

export const activeRequestsGauge = meter.createUpDownCounter('http_active_requests', {
  description: 'Number of active HTTP requests',
  valueType: ValueType.INT
});

// =============================================================================
// Database Metrics
// =============================================================================

export const dbQueryHistogram = meter.createHistogram('db_query_duration_ms', {
  description: 'Database query duration',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

export const dbConnectionGauge = meter.createUpDownCounter('db_connections_active', {
  description: 'Number of active database connections',
  valueType: ValueType.INT
});

// =============================================================================
// Temporal Workflow Metrics
// =============================================================================

export const workflowStartedCounter = meter.createCounter('workflow_started_total', {
  description: 'Total workflows started',
  valueType: ValueType.INT
});

export const workflowCompletedCounter = meter.createCounter('workflow_completed_total', {
  description: 'Total workflows completed',
  valueType: ValueType.INT
});

export const workflowFailedCounter = meter.createCounter('workflow_failed_total', {
  description: 'Total workflows failed',
  valueType: ValueType.INT
});

export const activityLatencyHistogram = meter.createHistogram('activity_latency_ms', {
  description: 'Activity execution latency',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

// =============================================================================
// Helper Functions
// =============================================================================

export function recordPaymentAttempt(processor: string, currency: string, status: 'success' | 'failed' | 'pending') {
  paymentCounter.add(1, { processor, currency, status });
}

export function recordPaymentAmount(amount: number, processor: string, currency: string) {
  paymentAmountHistogram.record(amount, { processor, currency });
}

export function recordPaymentLatency(durationMs: number, processor: string, status: 'success' | 'failed') {
  paymentLatencyHistogram.record(durationMs, { processor, status });
}

export function recordWebhookDelivery(status: 'success' | 'failed', attempt: number) {
  webhookDeliveryCounter.add(1, { status, attempt: String(attempt) });
}

export function recordWebhookLatency(durationMs: number, status: 'success' | 'failed') {
  webhookLatencyHistogram.record(durationMs, { status });
}

export function recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number) {
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  httpRequestCounter.add(1, { method, path, status_code: String(statusCode), status_class: statusClass });
  httpRequestLatencyHistogram.record(durationMs, { method, path, status_class: statusClass });
}

export function recordWorkflowStarted(workflowType: string, taskQueue: string) {
  workflowStartedCounter.add(1, { workflow_type: workflowType, task_queue: taskQueue });
}

export function recordWorkflowCompleted(workflowType: string, taskQueue: string, durationMs: number) {
  workflowCompletedCounter.add(1, { workflow_type: workflowType, task_queue: taskQueue });
}

export function recordWorkflowFailed(workflowType: string, taskQueue: string, errorType: string) {
  workflowFailedCounter.add(1, { workflow_type: workflowType, task_queue: taskQueue, error_type: errorType });
}

export function recordActivityLatency(activityType: string, durationMs: number, status: 'success' | 'failed') {
  activityLatencyHistogram.record(durationMs, { activity_type: activityType, status });
}
