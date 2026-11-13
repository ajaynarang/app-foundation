# Infrastructure alerts

Conventions, severity and escalation: [README.md](README.md).

These rules read AWS metrics through Grafana's CloudWatch datasource (`docs/observability.md`, level 2). No
data counts as alerting: the database, Redis and the API service always exist, so silence means something is gone,
or `PROJECT` in the catalog does not match the Terraform `project` and the rule reads a name that does not exist.
Fix that before trusting any of them. Every change below (instance class, storage, task size) goes through Terraform
and the product's deploy procedure.

## rds-storage-low

**sev1.** `AWS/RDS FreeStorageSpace` for `<project>-<env>-rds-postgres` is below 5 GB.

### What it means

The disk is filling. At zero, Postgres stops accepting writes and the product is effectively down.

### First three checks

1. **How fast is it falling?** Overview, "RDS free storage". A cliff means a runaway job or WAL build-up; a slope
   means growth.
2. **What is big?** Through the tunnel (`tools/db/tunnel.sh`), read-only:
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;
   ```
3. **Is data retention running?** A [cron-missed](queues-jobs.md#cron-missed) for `data-retention` or `job-cleanup`
   means old rows are not pruned.

### Mitigation

Raise `rds_allocated_storage` (storage only grows, never shrinks) and apply. Run the retention job once it is fixed.

### Escalation

Escalate to the owner at once: the fix is an infrastructure change.

## rds-connections-high

**sev1.** `AWS/RDS DatabaseConnections` has stayed above 75% of `max_connections` for ten minutes. The limit per
environment is `rdsMaxConnections` in `catalog/constants.mjs`; it must match the instance class.

### What it means

New connections start failing at the limit, and every request and job needs one.

### First three checks

1. **Who holds them?** Through the tunnel:
   ```sql
   SELECT usename, application_name, state, count(*) FROM pg_stat_activity GROUP BY 1, 2, 3 ORDER BY 4 DESC;
   ```
2. **More tasks than usual?** Overview, "ECS CPU per service" and the service's running count. Each task opens its own
   pool.
3. **Long transactions?** `pg_stat_activity` rows in `idle in transaction` for minutes point to a leak in code.

### Mitigation

- Too many tasks for the instance: lower the desired count, or move to a larger instance class.
- A leak: redeploy to release the connections, then fix the code.
- If `rdsMaxConnections` is wrong for the class, correct it and regenerate the catalog.

### Escalation

Not resolved in 30 minutes: escalate to the owner.

## rds-cpu-high

**sev2.** RDS CPU has been above 80% for ten minutes (every one-minute point).

### What it means

Queries slow down for everyone; [api-latency-p95](api.md#api-latency-p95) often fires with it.

### First three checks

1. Which queries? Performance Insights if enabled, or through the tunnel
   `SELECT query, calls, total_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;` when the
   extension is on.
2. Did a deploy or a cron start just before? Overview annotations; Queues and jobs, cron run time.
3. Is a burstable instance out of CPU credits (`CPUCreditBalance` near zero)?

### Mitigation

Fix or index the expensive query; move heavy work off peak; raise the instance class if load is real.

### Escalation

None out of hours unless the API is failing.

## rds-freeable-memory-low

**sev2.** RDS freeable memory has stayed below 40 MB for fifteen minutes. A small instance idles near 100 MB, so a
higher line fires on a healthy database.

### What it means

The instance is short of memory for its working set; swap and slow queries follow.

### First three checks

1. Overview, RDS memory and swap together.
2. Connection count: each connection costs memory ([rds-connections-high](#rds-connections-high)).
3. A recent change to the parameter group (`work_mem`, `shared_buffers`)?

### Mitigation

Fewer connections, or a larger instance class.

### Escalation

None out of hours.

## rds-swap-high

**sev2.** RDS swap has stayed above 256 MB for fifteen minutes.

### What it means

Sustained swap means the instance is out of memory; queries get slow.

### First three checks

As for [rds-freeable-memory-low](#rds-freeable-memory-low).

### Mitigation

As for [rds-freeable-memory-low](#rds-freeable-memory-low).

### Escalation

None out of hours.

## redis-memory-high

**sev1.** ElastiCache `DatabaseMemoryUsagePercentage` for `<project>-<env>-redis-001` is above 80%.

### What it means

Redis holds the queues and the cache, with no eviction of queue keys. At 100% every write fails, which stops every
queue and every enqueue.

### First three checks

1. **Is a queue piling up?** Queues and jobs board, depth per queue. Thousands of waiting or failed jobs hold memory.
2. **Are finished jobs kept too long?** The failed and completed sets on the BullMQ board.
3. **Is the cache unbounded?** `GET /admin/cache/stats`.

### Mitigation

- A backed-up queue: fix its consumer ([queue-stalled](queues-jobs.md#queue-stalled)), then let it drain.
- Old failed or completed jobs: clean them from the board.
- Cache: `POST /admin/cache/flush` (safe; it refills from the database).
- Real growth: a larger node type through Terraform.

### Escalation

Escalate to the owner at once if above 90%.

## ecs-service-gone-api

**sev1.** `AWS/ECS CPUUtilization` for `<project>-<env>-ecs-service-api` has sent no data for ten minutes. ECS stops
sending it when no task of the service runs.

### What it means

The API is down; the uptime check pages too.

### First three checks

1. Service events, read-only:
   ```bash
   aws ecs describe-services --cluster <project>-<env>-ecs-cluster --services <project>-<env>-ecs-service-api \
     --query 'services[].{running:runningCount,desired:desiredCount,events:events[0:5].message}'
   ```
2. Why did the last task stop? `aws ecs list-tasks --cluster … --service-name … --desired-status STOPPED`, then
   `aws ecs describe-tasks` and its `stoppedReason` (out of memory, failed health check, image pull).
3. Boot output in the service's CloudWatch log group: a crash before the logger starts appears only there.

### Mitigation

- Bad image or configuration: redeploy the previous image.
- Out of memory: redeploy the previous image, then raise the task memory in Terraform.
- Desired count set to 0 by mistake: set it back.

### Escalation

Escalate to the owner at once.

## ecs-service-gone-worker

**sev1.** As [ecs-service-gone-api](#ecs-service-gone-api), for `<project>-<env>-ecs-service-worker`. This is the
only rule that names the worker. It exists only while `HAS_WORKER` is `true` in `catalog/constants.mjs`: a product
with `worker_desired_count = 0` sets it to `false` and regenerates, because a service with no task would page for
good.

### What it means

No worker task runs. If the API also consumes queues (`QUEUE_PROCESSORS_ENABLED` unset or `true` on it), work goes
on there, slower; if not, background work has stopped and
[worker-heartbeat-missing](queues-jobs.md#worker-heartbeat-missing) follows.

### First three checks

The checks of [ecs-service-gone-api](#ecs-service-gone-api), for the worker service.

### Mitigation

As for [ecs-service-gone-api](#ecs-service-gone-api).

### Escalation

Escalate to the owner if not back in 15 minutes.
