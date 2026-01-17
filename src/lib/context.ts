import { AsyncLocalStorage } from 'async_hooks';
import { nanoid } from 'nanoid';
import { context, propagation } from '@opentelemetry/api';

/**
 * Correlation context for tracking requests across services
 */
export interface CorrelationContext {
  correlationId: string;
  merchantId?: string;
  orderId?: string;
  workflowId?: string;
}

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

// Standard headers for correlation
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';
export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Get the current correlation context
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Run a function with a correlation context
 */
export function withCorrelationContext<T>(ctx: CorrelationContext, fn: () => T): T {
  return correlationStorage.run(ctx, fn);
}

/**
 * Run an async function with a correlation context
 */
export async function withCorrelationContextAsync<T>(ctx: CorrelationContext, fn: () => Promise<T>): Promise<T> {
  return correlationStorage.run(ctx, fn);
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return nanoid(21);
}

/**
 * Extract correlation ID from headers (case-insensitive)
 */
export function extractCorrelationId(headers: Record<string, string | undefined>): string {
  // Normalize header keys to lowercase for lookup
  const normalizedHeaders: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  return (
    normalizedHeaders[CORRELATION_ID_HEADER.toLowerCase()] ||
    normalizedHeaders[REQUEST_ID_HEADER.toLowerCase()] ||
    generateCorrelationId()
  );
}

/**
 * Create headers for propagating correlation context to downstream services
 */
export function createPropagationHeaders(correlationId: string): Record<string, string> {
  const headers: Record<string, string> = {
    [CORRELATION_ID_HEADER]: correlationId
  };

  // Inject OpenTelemetry trace context
  propagation.inject(context.active(), headers);

  return headers;
}

/**
 * Create correlation context from Temporal workflow memo
 */
export function createContextFromMemo(memo: Record<string, unknown>): CorrelationContext {
  return {
    correlationId: (memo.correlationId as string) || generateCorrelationId(),
    merchantId: memo.merchantId as string | undefined,
    orderId: memo.orderId as string | undefined,
    workflowId: memo.workflowId as string | undefined
  };
}
