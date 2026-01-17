# @payloops/observability

Shared observability package for PayLoops services. Provides OpenTelemetry tracing, structured logging, correlation context, and metrics.

## Installation

```bash
npm install @payloops/observability
```

## Features

- **OpenTelemetry** - Automatic tracing and metrics export
- **Structured Logging** - Pino logger with trace context
- **Correlation Context** - AsyncLocalStorage for request tracking
- **Metrics** - Pre-defined counters and histograms for payments, webhooks, HTTP, and workflows

## Usage

### Initialize Telemetry

Initialize OpenTelemetry **before any other imports** in your entry point:

```typescript
import { initTelemetry } from '@payloops/observability';

// Simple initialization
initTelemetry('my-service', '1.0.0');

// Or with full config
initTelemetry({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  otlpEndpoint: 'http://localhost:4318',
  environment: 'production',
  enabledInstrumentations: {
    http: true,
    pg: true,
    fs: false
  }
});
```

### Logging

```typescript
import { logger, createRequestLogger } from '@payloops/observability';

// Basic logging (automatically includes trace context)
logger.info({ orderId: '123' }, 'Processing order');

// Create a request-scoped logger
const reqLogger = createRequestLogger('req-123', 'POST', '/orders');
reqLogger.info('Request started');
```

### Correlation Context

Track requests across async boundaries:

```typescript
import {
  withCorrelationContext,
  getCorrelationContext,
  extractCorrelationId,
  createPropagationHeaders
} from '@payloops/observability';

// In HTTP middleware
app.use((req, res, next) => {
  const correlationId = extractCorrelationId(req.headers);

  withCorrelationContext({ correlationId }, () => {
    // All code in this context has access to correlationId
    next();
  });
});

// Later in your code
const ctx = getCorrelationContext();
console.log(ctx?.correlationId); // Available anywhere in the call stack

// When calling downstream services
const headers = createPropagationHeaders(ctx.correlationId);
fetch('http://other-service/api', { headers });
```

### Metrics

```typescript
import {
  recordPaymentAttempt,
  recordPaymentAmount,
  recordHttpRequest,
  recordWorkflowStarted
} from '@payloops/observability';

// Record a payment attempt
recordPaymentAttempt('stripe', 'USD', 'success');
recordPaymentAmount(9999, 'stripe', 'USD');

// Record HTTP request
recordHttpRequest('POST', '/v1/orders', 201, 45.2);

// Record workflow execution
recordWorkflowStarted('PaymentWorkflow', 'stripe-payments');
```

## Available Exports

### OpenTelemetry
- `initTelemetry(config)` - Initialize OpenTelemetry SDK
- `shutdownTelemetry()` - Gracefully shutdown telemetry

### Logger
- `logger` - Base Pino logger with trace context
- `createActivityLogger(name, correlationId)` - Logger for Temporal activities
- `createWorkflowLogger(workflowId, correlationId)` - Logger for workflows
- `createRequestLogger(requestId, method, path)` - Logger for HTTP requests

### Correlation Context
- `getCorrelationContext()` - Get current context
- `withCorrelationContext(ctx, fn)` - Run function with context
- `generateCorrelationId()` - Generate new ID
- `extractCorrelationId(headers)` - Extract from HTTP headers
- `createPropagationHeaders(correlationId)` - Create headers for downstream calls
- `CORRELATION_ID_HEADER` - Header name constant

### Metrics
| Metric | Type | Description |
|--------|------|-------------|
| `payments_total` | Counter | Payment attempts |
| `payment_amount` | Histogram | Payment amounts |
| `payment_latency_ms` | Histogram | Payment processing time |
| `webhook_deliveries_total` | Counter | Webhook delivery attempts |
| `webhook_latency_ms` | Histogram | Webhook delivery time |
| `http_requests_total` | Counter | HTTP requests |
| `http_request_latency_ms` | Histogram | HTTP request time |
| `http_active_requests` | Gauge | Active HTTP requests |
| `db_query_duration_ms` | Histogram | Database query time |
| `workflow_started_total` | Counter | Workflows started |
| `workflow_completed_total` | Counter | Workflows completed |
| `workflow_failed_total` | Counter | Workflows failed |
| `activity_latency_ms` | Histogram | Activity execution time |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | `http://localhost:4318` |
| `OTEL_SERVICE_NAME` | Service name | `loop` |
| `NODE_ENV` | Environment | `development` |
