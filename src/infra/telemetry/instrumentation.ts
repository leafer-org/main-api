/**
 * OpenTelemetry auto-instrumentation entry point.
 *
 * Loaded via `--import ./dist/infra/telemetry/instrumentation.js` BEFORE the app starts.
 * This ensures all libraries are patched before any user code runs.
 */

import { env } from 'node:process';
import EventEmitter from 'node:events';

EventEmitter.defaultMaxListeners = 20;

const { NodeSDK } = await import('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = await import(
  '@opentelemetry/auto-instrumentations-node'
);
const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor, LoggerProvider } = await import('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = await import('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
const { SeverityNumber } = await import('@opentelemetry/api-logs');
const { trace } = await import('@opentelemetry/api');

const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const serviceName = env.OTEL_SERVICE_NAME ?? 'main-api';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
});

const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` });
const logProcessor = new BatchLogRecordProcessor(logExporter);

const loggerProvider = new LoggerProvider({ resource, processors: [logProcessor] });
const otelLogger = loggerProvider.getLogger('console-bridge');

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    exportIntervalMillis: 15_000,
  }),
  logRecordProcessor: logProcessor,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

sdk.start();

// Bridge stdout/stderr → OTel Logs (keeps console output intact)
function hookStream(stream: NodeJS.WriteStream, severity: number) {
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk: any, ...args: any[]) => {
    const message = typeof chunk === 'string' ? chunk.trimEnd() : Buffer.from(chunk).toString().trimEnd();
    if (message.length > 0) {
      const span = trace.getActiveSpan();
      const spanContext = span?.spanContext();
      otelLogger.emit({
        severityNumber: severity,
        body: message,
        attributes: {
          source: stream === process.stdout ? 'stdout' : 'stderr',
          ...(spanContext ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : {}),
        },
      });
    }
    return originalWrite(chunk, ...args);
  };
}

hookStream(process.stdout, SeverityNumber.INFO);
hookStream(process.stderr, SeverityNumber.ERROR);

const shutdown = async () => {
  await loggerProvider.forceFlush();
  await sdk.shutdown();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
