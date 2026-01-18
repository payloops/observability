import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  BatchLogRecordProcessor
} from '@opentelemetry/sdk-logs';
import { logs } from '@opentelemetry/api-logs';

let sdk: NodeSDK | null = null;
let loggerProvider: LoggerProvider | null = null;

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  environment?: string;
  enabledInstrumentations?: {
    fs?: boolean;
    http?: boolean;
    pg?: boolean;
  };
}

export function initTelemetry(config: TelemetryConfig | string, serviceVersion = '0.0.1'): NodeSDK {
  if (sdk) return sdk;

  // Support both string (legacy) and config object
  const cfg: TelemetryConfig =
    typeof config === 'string' ? { serviceName: config, serviceVersion } : config;

  const otlpEndpoint = cfg.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const environment = cfg.environment || process.env.NODE_ENV || 'development';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: cfg.serviceName,
    [ATTR_SERVICE_VERSION]: cfg.serviceVersion || '0.0.1',
    'deployment.environment': environment
  });

  // Set up log exporter
  const logExporter = new OTLPLogExporter({
    url: `${otlpEndpoint}/v1/logs`
  });

  loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

  // Register the logger provider globally
  logs.setGlobalLoggerProvider(loggerProvider);

  sdk = new NodeSDK({
    resource,

    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    }),

    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`
      }),
      exportIntervalMillis: 30000
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: cfg.enabledInstrumentations?.fs ?? false },
        '@opentelemetry/instrumentation-http': { enabled: cfg.enabledInstrumentations?.http ?? true },
        '@opentelemetry/instrumentation-pg': { enabled: cfg.enabledInstrumentations?.pg ?? true }
      })
    ]
  });

  sdk.start();

  process.on('SIGTERM', () => {
    Promise.all([sdk?.shutdown(), loggerProvider?.shutdown()])
      .then(() => console.log('Telemetry shut down'))
      .catch((err) => console.error('Telemetry shutdown error', err));
  });

  return sdk;
}

export function shutdownTelemetry(): Promise<void> {
  if (!sdk) return Promise.resolve();
  return sdk.shutdown();
}
