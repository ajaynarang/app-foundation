---
title: Observability
description: Loki (logs) + Tempo (traces) + Grafana (UI). Local is opt-in via the observability Docker profile. What to look at for what.
---

# Observability

The stack is **Loki + Tempo + Grafana**. Local is opt-in — none of these services start with the default `docker-compose up -d`. Production ships to managed Loki and Tempo via the same configuration.

This page replaces every reference to Jaeger in older docs. We no longer use Jaeger.

## The components

| Component | Purpose | Local port | Image |
|---|---|---|---|
| Loki | Log ingest + query | `127.0.0.1:3100` | `grafana/loki:3.2.0` |
| Tempo | Trace ingest (OTLP) + query | `127.0.0.1:3200` (query), `4317` (OTLP gRPC), `4318` (OTLP HTTP) | `grafana/tempo:2.6.0` |
| Grafana | UI for both — Explore + dashboards | `127.0.0.1:3003` | `grafana/grafana:11.3.0` |

All three are localhost-only (loopback). Grafana runs with anonymous admin and the login form disabled — fine for local, never use the same config in production.

## Start the stack

```bash
docker-compose --profile observability up -d
```

The `observability` profile is opt-in. The default profile (postgres, redis, inngest) does not include it. Stop:

```bash
docker-compose --profile observability down
```

Grafana datasources for Loki and Tempo are provisioned automatically from `infra/observability/grafana/provisioning/datasources/`. Dashboards (if any) come from `provisioning/dashboards/`. Pre-built queries live in `infra/observability/GRAFANA_QUERIES.md`.

## How the backend ships data

### Traces — OpenTelemetry → Tempo

`apps/backend/src/infrastructure/telemetry/telemetry.ts` initializes the OpenTelemetry SDK on backend startup (skipped in `NODE_ENV=test`).

- **Auto-instrumentations:** HTTP, Prisma, Redis, BullMQ. FS and DNS are disabled.
- **Exporter:** `OTLPTraceExporter` (HTTP) to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`.
- **Default endpoint:** `http://localhost:4318` — the Tempo OTLP HTTP receiver.
- **Service name:** `OTEL_SERVICE_NAME`, defaulting to `sally-backend`.
- **Graceful shutdown:** `shutdownTelemetry()` is called from the NestJS shutdown hook AFTER the app stops accepting requests, so in-flight spans are flushed.

The backend silently falls back if Tempo isn't running — spans accumulate in the buffer and get dropped on shutdown. Apps still work; you just can't see traces.

### Logs — Pino → Loki (optional transport)

`apps/backend/src/infrastructure/logging/pino-transport.ts` builds the Pino transport based on env:

| `LOG_TRANSPORT` | `NODE_ENV` | Behavior |
|---|---|---|
| `loki` | `development` | pino-pretty (terminal) + pino-loki (browser) |
| `loki` | other | pino-loki only (JSON also goes to stdout) |
| _(unset)_ | `development` | pino-pretty only — colorized, single-line |
| _(unset)_ | other | raw JSON to stdout |

- **Loki URL:** `LOKI_URL`, defaulting to `http://localhost:3100`.
- **Labels:** `{ service: <OTEL_SERVICE_NAME or 'sally-backend'>, env: <NODE_ENV or 'unknown'> }`. `propsToLabels` adds `level`.
- **Best-effort:** `silenceErrors: true`. If Loki is down, the transport logs a warning once and stops complaining — dev never blocks on observability infra.

To ship logs locally, you have to set `LOG_TRANSPORT=loki`:

```bash
LOG_TRANSPORT=loki pnpm doppler:backend
```

## Correlation

The backend's `request-context.middleware.ts` (in `apps/backend/src/infrastructure/logging/`) puts the active trace ID into the request-scoped logger context. Every log line carries the `trace_id` field; clicking it in Loki jumps you to the corresponding trace in Tempo. (Grafana's Explore view supports this transparently when the datasources are linked — they are, in the provisioning.)

## What to look at for what

| Problem | Where to look | How |
|---|---|---|
| Slow request | Grafana → Explore → **Tempo** | Search by trace ID, or by service `sally-backend` + duration `> 500ms`. The auto-instrumented Prisma spans show which query took the time. |
| Error | Grafana → Explore → **Loki** | Filter `service="sally-backend"`, `level="error"`. Add `tenant_id="…"` to scope by tenant. |
| Correlate a 500 with the trace | Click the `trace_id` in the Loki log line | Opens the matching trace in Tempo. |
| Queue worker stalled | Grafana → Explore → **Loki** | Filter on the queue name in the log message body. BullMQ logs job lifecycle. |
| Cron / repeat job not firing | Loki + the `JobSchedule` Prisma table | The `ScheduleManagerService` logs registration; inspect the `JobSchedule` rows for `is_enabled = true`. |

If a query gets repetitive, add it to `infra/observability/GRAFANA_QUERIES.md` so the next person has the snippet.

## Production

The same Pino transport and OTel SDK ship to managed Loki and Tempo in staging and production. Endpoint URLs and tokens are set per environment via Doppler. Configuration lives in `infra/terraform/` (look for `loki`, `tempo`, `grafana` in the modules).

The frontend doesn't currently ship logs or traces — error reporting is handled separately. Vercel runtime logs and OpenTelemetry on the Vercel side are TODO.
