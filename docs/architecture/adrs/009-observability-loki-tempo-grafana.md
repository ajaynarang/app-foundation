---
title: "ADR-009: Observability — Loki + Tempo + Grafana"
description: Replace Jaeger-only tracing with the Loki+Tempo+Grafana stack. Local is opt-in.
---

# ADR-009: Observability — Loki + Tempo + Grafana

**Date:** 2026-05-20
**Status:** Proposed — drafted from observed code; awaiting acceptance.

## Context

The earlier observability story (per pre-2026 docs) used Jaeger for distributed tracing and stdout for logs. As the platform grew:

- We needed correlated logs and traces (jump from a log line to its trace).
- We needed log search and labels (Jaeger doesn't do logs).
- We needed a single dashboard surface for ops queries.

Three sub-decisions surfaced:

1. Adopt a Grafana-stack toolchain for one UI.
2. Replace Jaeger with Tempo (compatible OTLP receiver, integrates with Grafana, runs the same OpenTelemetry SDK on the backend side without changes).
3. Make local observability **opt-in** so dev environments stay light by default.

## Decision

**The stack is Loki (logs) + Tempo (traces) + Grafana (UI).**

- Backend logs ship through Pino with an optional `pino-loki` transport. Source: `apps/backend/src/infrastructure/logging/pino-transport.ts`. Loki URL defaults to `http://localhost:3100`; production endpoint is set via Doppler.
- Backend traces ship through OpenTelemetry SDK with the OTLP HTTP exporter. Source: `apps/backend/src/infrastructure/telemetry/telemetry.ts`. Default endpoint `http://localhost:4318/v1/traces`; production endpoint is set via Doppler.
- Grafana provisions Loki and Tempo as datasources automatically from `infra/observability/grafana/provisioning/datasources/`.
- Local observability is **opt-in** via the `observability` Docker Compose profile. The default `docker-compose up -d` does **not** start Loki/Tempo/Grafana — they bind to `127.0.0.1` and start only with `docker-compose --profile observability up -d`.
- Backend silently falls back when the stack isn't running. Pino prints to stdout; OpenTelemetry buffers spans that nothing exports. Apps still work; you just can't see traces.
- Trace ID propagates into every log line via `apps/backend/src/infrastructure/logging/request-context.middleware.ts`, so clicking `trace_id` in Loki jumps to the matching Tempo trace.

## Consequences

### Positive

- One UI for logs and traces.
- Correlation between the two is built-in.
- Grafana dashboards travel with the codebase via `provisioning/`.
- Opt-in local stack keeps dev memory and CPU usage low.
- The same Pino transport and OTel exporter work in production with a different endpoint URL — no code change.

### Trade-offs

- The full observability story has more moving parts than Jaeger alone (three services instead of one).
- The opt-in local default means new engineers may not see traces by default — the [Observability docs page](../observability.md) calls out the env var (`LOG_TRANSPORT=loki`) and the compose profile so this isn't a trap.

### Neutral

- Frontend doesn't yet ship logs or traces — Vercel runtime logs are separate. A future ADR may cover frontend telemetry.

## Evidence

- `docker-compose.yml:32-88` — Loki, Tempo, Grafana services under the `observability` profile.
- `apps/backend/src/infrastructure/telemetry/telemetry.ts:12` — OTLP endpoint default `http://localhost:4318`.
- `apps/backend/src/infrastructure/logging/pino-transport.ts:18` — Loki URL default `http://localhost:3100`.
- `infra/observability/{loki,tempo,grafana}/` — config and provisioning.
- Memory pin: `observability_stack.md` ("CLAUDE.md is stale on this — Loki + Tempo + Grafana").
- This supersedes the Jaeger references in pre-2026 docs.
