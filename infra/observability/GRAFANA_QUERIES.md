# Grafana / Loki — Useful Queries

Quick reference for debugging backend logs in the local observability stack.

- Grafana UI: http://localhost:3003 → **Explore** → datasource **Loki** → code mode
- Start stack: `docker-compose --profile observability up -d`
- Stop + wipe: `docker-compose --profile observability down -v`

Pino level numbers:

| Num | Word  |
| --- | ----- |
| 10  | trace |
| 20  | debug |
| 30  | info  |
| 40  | warn  |
| 50  | error |
| 60  | fatal |

---

## By severity

```logql
# Errors only
{service="app-backend"} | json | level="50"

# Warnings and above
{service="app-backend"} | json | level=~"40|50|60"

# Errors + fatals
{service="app-backend"} | json | level=~"50|60"
```

## By tenant

```logql
# One tenant, everything
{service="app-backend"} | json | tenantId="demo-northstar-2026"

# One tenant, errors only
{service="app-backend"} | json | tenantId="7" | level="50"

# All tenants EXCEPT the demo tenant
{service="app-backend"} | json | tenantId!="demo-northstar-2026"
```

## By user

```logql
# What did this user trigger?
{service="app-backend"} | json | userId="user_demo_owner"

# Admins actions only (any UUID — replace with yours)
{service="app-backend"} | json | userId="<paste-from-jwt>"
```

## By request (end-to-end trace of one API call)

Grab `x-request-id` from browser Network tab → Response headers.

```logql
{service="app-backend"} | json | requestId="a2c03e6e-499f-46cb-9122-40c0a2c6ab86"
```

## By BullMQ job

```logql
# All logs from one job type
{service="app-backend"} | json | jobName="route-plan-progress"

# One specific job run (jobId comes from Bull Board or the logs themselves)
{service="app-backend"} | json | jobId="12345"

# All sync-related jobs, errors only
{service="app-backend"} | json | jobName=~".*sync.*" | level="50"

# Heavy-hitter processors (filter out noise)
{service="app-backend"} | json | jobName=~"route-plan-progress|samsara-sync|data-retention"

# Logs from ANY job (BullMQ work), not HTTP
{service="app-backend"} | json | jobName!=""

# Logs from HTTP only, no background jobs
{service="app-backend"} | json | jobName=""
```

## By NestJS service / controller

```logql
# Only from MonitoringEngineService
{service="app-backend"} | json | context="MonitoringEngineService"

# Any service matching a pattern
{service="app-backend"} | json | context=~".*Controller"
{service="app-backend"} | json | context=~".*Service"

# Exclude noisy ones
{service="app-backend"} | json | context!~"HealthController|SseController"
```

## By message content (regex)

```logql
# Anything mentioning "failed"
{service="app-backend"} | json | msg=~".*failed.*"

# "rate-con" or "ratecon"
{service="app-backend"} | json | msg=~".*rate.?con.*"

# SQL-ish errors (P2002 unique constraint etc.)
{service="app-backend"} | json | msg=~"P20[0-9]{2}"
```

## By trace (link logs ↔ Tempo)

```logql
# All logs for this trace (same HTTP request chain across services/jobs)
{service="app-backend"} | json | traceId="90b83c18d6502832cb30bf1b89d9a729"
```

Or click the `traceId` field on any log row → Grafana jumps to the trace in Tempo.

---

## Combinations (real debugging scenarios)

```logql
# "Why did tenant 7's Samsara sync fail at 14:03?"
{service="app-backend"} | json | tenantId="7" | jobName="samsara-sync" | level="50"

# "What happened in this whole request, end-to-end?"
{service="app-backend"} | json | requestId="<paste-uuid>"

# "Route planning is slow — find the longest logs"
{service="app-backend"} | json | context="RoutePlanningService" | msg=~".*completed in [0-9]{4,}.*"

# "Customer reported a 400 on POST /loads"
{service="app-backend"} | json | context="LoadsController" | level=~"40|50" | msg=~".*POST /loads.*"

# "All errors in the last 15min, grouped by service"
sum by (context) (count_over_time({service="app-backend"} | json | level="50" [15m]))

# "Top 5 noisiest jobs right now"
topk(5, sum by (jobName) (count_over_time({service="app-backend"} | json | jobName!="" [5m])))
```

---

## Viewing hints

- **Pretty log row**: add `| line_format "{{.msg}} (t={{.tenantId}} ctx={{.context}})"` at the end of any query.
- **Show only the message column**: click the `msg` field label → "Show only this field".
- **Live tail**: toggle the **Live** button (top-right in Explore).
- **Time range**: top-right picker — `Last 15m` default, bump to `Last 6h` for deeper history (Loki retention = 7 days local).

## Gotchas

- `level` is a number string in Loki (`"30"`, not `"info"`). Use the number.
- Fields you reference with `| fieldname="..."` must exist in the log's JSON. Missing fields = row skipped silently.
- `{service="app-backend"}` is always the stream selector — Loki needs at least one label match before any `|` pipeline stage.
