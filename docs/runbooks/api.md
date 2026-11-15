# API alerts

Conventions, severity and escalation: [README.md](README.md).

## api-5xx-rate

**sev1.** `writeErrorEnvelope` (Logger context `HttpExceptionFilter`) logged five or more 5xx answers in five
minutes.

### What it means

Requests that reached a healthy API task are failing on our side. Users see error messages. A load balancer with no
healthy target answers 502, 503 or 504 without writing this line: the uptime check pages for that, and
[ecs-service-gone-api](infra.md#ecs-service-gone-api) may fire with it.

### First three checks

1. **Which routes, and how many?** Grafana Explore, Loki:
   ```logql
   sum by (msg) (count_over_time({sel} |= "Status: 5" | json | context="HttpExceptionFilter" | msg=~".*Status: 5[0-9][0-9].*" [15m]))
   ```
   One route means one feature is broken. Every route at once means a shared dependency (database, Redis) or a bad
   deploy.
2. **Did a deploy just happen?** The Overview board shows deploy annotations; Sentry Releases shows the same.
3. **Is a dependency down?** Overview, AWS row: RDS connections and CPU, Redis memory. In Sentry, open the newest
   issue for `environment:<env>` and follow its `requestId` to the log lines and its `traceId` to the trace.

### Mitigation

- Bad deploy: redeploy the previous image (the deploy workflow takes a git SHA).
- Database saturated: [rds-connections-high](infra.md#rds-connections-high). Redis full:
  [redis-memory-high](infra.md#redis-memory-high).
- One broken route that is not core: turn it off with its feature flag and fix forward.

### Escalation

Not mitigated in 30 minutes, or every route failing: escalate to the owner.

## api-availability-burn-fast

**sev1.** The share of non-4xx requests answered with a 5xx is above 14.4 times the 0.5% error budget (7.2%), over
both the last hour and the last five minutes. Read from the HTTP server histogram (`http_server_request_duration`).

### What it means

At this rate the 30-day budget of the 99.5% availability objective is gone in about two days. It sees what
[api-5xx-rate](#api-5xx-rate) sees, as a share of traffic rather than a count, so it also fires on a quiet API.

### First three checks

1. The SLOs board: budget left, and the burn-rate lines. Is it still climbing?
2. The three checks of [api-5xx-rate](#api-5xx-rate).
3. If the 5xx share is high but the count is tiny, check whether traffic dropped (a load balancer or DNS problem
   sends fewer requests, and the few left fail).

### Mitigation

As for [api-5xx-rate](#api-5xx-rate).

### Escalation

Not mitigated in 30 minutes: escalate to the owner.

## api-availability-burn-slow

**sev2.** The 5xx share of non-4xx requests is above six times the budget (3%) over both six hours and 30 minutes.

### What it means

The error budget would be gone in about five days. Something is steadily failing: one route, one tenant's data, a
slow dependency that times out.

### First three checks

1. The SLOs board, "Slowest routes" and the burn trend.
2. The route query in [api-5xx-rate](#api-5xx-rate), over six hours instead of fifteen minutes.
3. Sentry, sorted by event count for `environment:<env>`.

### Mitigation

Fix the failing route this week. It is not an out-of-hours fix.

### Escalation

None out of hours. Raise it at the next planning if the budget keeps falling.

## api-latency-p95

**sev2.** The 95th percentile of API request time has been above one second for ten minutes.

### What it means

The latency objective (p95 under 1 s) is broken. Users wait. Usually a slow query, a saturated database, or a slow
third-party call made inside the request.

### First three checks

1. SLOs board, "Slowest routes": one route or all of them?
2. Overview, AWS row: RDS CPU and connections. All routes slow at once usually means the database.
3. Open a slow request's trace (Tempo or the hosted trace view, from a log line's `traceId`): which span takes the
   time?

### Mitigation

- One slow query: add the missing index or fix the query, ship it.
- Database saturated: [rds-cpu-high](infra.md#rds-cpu-high).
- A slow outside call in a request: move it to a job.

### Escalation

None out of hours unless [api-5xx-rate](#api-5xx-rate) fires too.
