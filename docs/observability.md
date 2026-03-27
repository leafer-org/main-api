# Observability Stack — Grafana + Tempo + Loki + Prometheus

## Обзор

Стек мониторинга построен на OpenTelemetry Collector как единой точке сбора телеметрии.
Приложение отправляет **traces, metrics и logs** через OTLP-протокол в Collector,
который маршрутизирует данные в соответствующие бэкенды.

```
┌─────────────┐       OTLP (gRPC :4317)       ┌──────────────────┐
│  NestJS App  │ ────────────────────────────► │  OTel Collector   │
│  (auto-instr)│                               │                   │
└─────────────┘                               └────┬────┬────┬────┘
                                                    │    │    │
                                         traces     │    │    │  logs
                                                    ▼    │    ▼
                                              ┌───────┐  │  ┌───────┐
                                              │ Tempo  │  │  │ Loki  │
                                              └───────┘  │  └───────┘
                                                         │ metrics
                                                         ▼
                                                   ┌───────────┐
                                                   │ Prometheus │
                                                   └───────────┘
                                                         │
                                              ┌──────────┴──────────┐
                                              │      Grafana        │
                                              │  (datasources:      │
                                              │   Tempo, Loki,      │
                                              │   Prometheus)       │
                                              └─────────────────────┘
```

## Компоненты

| Компонент | Назначение | Порт |
|-----------|-----------|------|
| **OTel Collector** | Приём, обработка и маршрутизация телеметрии | 4317 (gRPC), 4318 (HTTP) |
| **Grafana Tempo** | Хранение и поиск distributed traces | 3200 (HTTP), 9095 (gRPC) |
| **Grafana Loki** | Хранение и поиск логов | 3100 (HTTP) |
| **Prometheus** | Хранение метрик, scraping | 9090 |
| **Grafana** | Визуализация, дашборды, алертинг | 3300 |

## Авто-инструментация

Приложение использует `@opentelemetry/auto-instrumentations-node` — zero-code инструментацию,
которая подключается через `--import` флаг **до** загрузки приложения.

### Что инструментируется автоматически

- **HTTP** — входящие/исходящие запросы (`@opentelemetry/instrumentation-http`)
- **Express** — middleware, routes, ошибки (`@opentelemetry/instrumentation-express`)
- **PostgreSQL (pg)** — все SQL-запросы с параметрами (`@opentelemetry/instrumentation-pg`)
- **ioredis** — все Redis-команды (`@opentelemetry/instrumentation-ioredis`)
- **DNS** — DNS-резолвинг (`@opentelemetry/instrumentation-dns`)
- **Net** — TCP-соединения
- **Runtime metrics** — event loop lag, GC, heap usage

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/infra/telemetry/instrumentation.ts` | Точка входа авто-инструментации (загружается через `--import`) |
| `docker/otel-collector.yaml` | Конфигурация OTel Collector |
| `docker/tempo.yaml` | Конфигурация Grafana Tempo |
| `docker/loki.yaml` | Конфигурация Grafana Loki |
| `docker/prometheus.yaml` | Конфигурация Prometheus |
| `docker/grafana/datasources.yaml` | Автоматическая настройка datasources в Grafana |

## Запуск

```bash
# 1. Поднять стек мониторинга
docker compose up -d grafana

# 2. Запустить приложение с инструментацией
yarn dev

# 3. Открыть Grafana
# http://localhost:3300  (admin / admin)
```

## Переменные окружения

| Переменная | Умолчание | Описание |
|-----------|-----------|---------|
| `OTEL_ENABLED` | `false` | Включить отправку телеметрии |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Endpoint OTel Collector (HTTP) |
| `OTEL_SERVICE_NAME` | `main-api` | Имя сервиса в traces/metrics/logs |

## Grafana — что доступно из коробки

### Traces (Tempo)
- Распределённые трейсы HTTP-запросов
- SQL-запросы к PostgreSQL с текстом и длительностью
- Redis-команды
- Связь trace → logs через `traceId`

### Logs (Loki)
- Все логи приложения (NestJS Logger)
- Фильтрация по `service_name`, `severity`, `traceId`
- Переход из лога в trace одним кликом

### Metrics (Prometheus)
- `http_server_request_duration_seconds` — латентность эндпоинтов
- `http_server_active_requests` — текущие активные запросы
- `process_*` — CPU, memory, event loop
- Runtime-метрики Node.js (GC, heap)

## Расширение

### Добавление кастомных метрик

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-feature');
const counter = meter.createCounter('my_feature.operations_total', {
  description: 'Total operations in my feature',
});

counter.add(1, { operation: 'create' });
```

### Добавление кастомных спанов

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-feature');

await tracer.startActiveSpan('my-operation', async (span) => {
  try {
    // ... business logic
    span.setAttributes({ 'my.attribute': 'value' });
  } finally {
    span.end();
  }
});
```

### Добавление кастомных лог-атрибутов

Логи автоматически обогащаются `traceId` и `spanId` — дополнительная настройка не нужна.
