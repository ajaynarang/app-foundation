# Queues and jobs alerts

Conventions, severity and escalation: [README.md](README.md).

Background work runs on BullMQ queues in Redis. The worker task consumes them; the API consumes too unless
`QUEUE_PROCESSORS_ENABLED=false`, and with no worker task (`worker_desired_count = 0`) the API is the only consumer.
Super-admins see every queue on the BullMQ board (`admin/queues` on the API), job records through `/admin/jobs`,
schedules through `/admin/schedules`, and timers and the outbox on the web page `/admin/timers`.

**The shared lane.** `bulk-ops` runs one job at a time and carries the outbox relay (every 10 s), the deadline sweep
(every 30 s), the heartbeat (every 5 min) and the foundation crons. No job may hold it for more than five minutes:
that is the lane budget, and the Queues and jobs board draws each cron's run time against it. The rules that a long
job on this lane could trip (`worker-heartbeat-missing`, `queue-stalled`, `outbox-backlog`, `deadline-sweep-late`)
wait fifteen minutes, three budgets. If a product's own work outgrows the budget, give the relay and the sweep their
own queue. Do not raise these windows instead: that hides a stalled relay for longer.

## job-failed-final

**sev1.** A `job.failed` line with `final=true`: a job used up its retries and BullMQ will not run it again. One
alert per job name, queue and tenant.

### What it means

The work that job does did not happen, for that tenant. The job is in the queue's failed set, and the error is in
Sentry (source `job`, tags `jobName`, `queue`, `tenantId`).

### First three checks

1. **What failed?** Sentry, filter `jobName:<jobName>`; or Loki:
   ```logql
   {sel} |= "job.failed" | json | event="job.failed" | jobName="<jobName>"
   ```
   The `err` field holds the error type, message and stack.
2. **One tenant or all?** The Queues and jobs board, "Final failures". All tenants at once means a shared cause (a
   provider, a deploy); one tenant means its data or its configuration.
3. **Is the queue itself healthy?** If [worker-heartbeat-missing](#worker-heartbeat-missing) or
   [queue-stalled](#queue-stalled) also fires, fix that first.

### Mitigation

Fix the cause, then retry the job from the BullMQ board or `POST /admin/jobs/:job_id/retry`. Handlers are written to
be safe to run twice.

### Escalation

Money, access or customer messages affected and not fixed in 30 minutes: escalate to the owner.

## job-unknown

**sev2.** A `job.unknown` line: a queue received a job name that no handler on it knows.

### What it means

Almost always deploy order: a new version enqueued a job the old consumer does not have yet, or a handler was
removed while jobs for it were still queued. The job fails and is not retried.

### First three checks

1. Is a deploy in progress, or did one just finish? The worker and API may be on different versions for a minute.
2. Is the name in the job-name constants (`queue.constants.ts` in the kernel, `job-names.ts` in the app) and is its
   handler registered with that queue's dispatcher?
3. How many such jobs are in the failed set (BullMQ board)?

### Mitigation

Once every task runs the new version, retry the failed jobs. A name with no handler at all is a code fix.

### Escalation

None out of hours.

## worker-heartbeat-missing

**sev1.** No `ops.heartbeat` line for fifteen minutes. The heartbeat is a repeatable job on `bulk-ops` every five
minutes, so three beats are missing. The rule selects the line by message, so it works whether the worker or the API
consumes the queue.

### What it means

Redis, the BullMQ scheduler or every consumer of `bulk-ops` is broken, or one job has held the lane far past its
budget. Background work, the outbox relay and the deadline sweep included, has stopped.

### First three checks

1. **Are the tasks running?** Overview, "ECS CPU per service"; or read-only:
   ```bash
   aws ecs describe-services --cluster <project>-<env>-ecs-cluster \
     --services <project>-<env>-ecs-service-worker <project>-<env>-ecs-service-api \
     --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,events:events[0:3].message}'
   ```
2. **Is Redis healthy?** Overview, Redis memory. At 100% every enqueue fails: [redis-memory-high](infra.md#redis-memory-high).
3. **Is one job holding the lane?** The BullMQ board, `bulk-ops`, active job and its start time; the Queues and jobs
   board, cron run time. Then: are any logs arriving at all (`sum(count_over_time({sel} [5m]))`)? If not, the
   problem is log shipping, not the queue: read the task's CloudWatch log group.

### Mitigation

- Consumer crash-looping: read the CloudWatch log group for the task (boot errors land only there), fix, redeploy.
  As a stopgap, force a new deployment of the service.
- Redis full or unreachable: fix Redis first; queued jobs resume on their own.
- A job holding the lane: let it finish if it is near the end, otherwise fix it to work in slices; see the lane note
  at the top.
- Heartbeat schedule disabled on purpose (the row `('maintenance', 'ops-heartbeat')` in `job_schedules`, which
  none ships: an operator inserts it for a test-fire, see the level 2 steps in `docs/observability.md`): find its id
  with `GET /admin/schedules` and re-enable it with `PATCH /admin/schedules/:id` and `{"isEnabled": true}`. With no
  such row in the list, the heartbeat is not disabled by a schedule; look at the other causes.

### Escalation

Not resolved in 15 minutes: escalate to the owner. All automation is stopped.

## queue-stalled

**sev1.** A queue's oldest waiting job has waited more than fifteen minutes (`app_queue_oldest_waiting_seconds`).

### What it means

Nothing is draining that queue, or one job is holding a one-at-a-time lane. Unlike the heartbeat, this names the
queue, so it also catches a queue whose consumer is gone while `bulk-ops` is fine.

### First three checks

1. Which queue? The alert's `queue` label. The Queues and jobs board, depth and age per queue.
2. Is anything consuming it? BullMQ board: active count. Is the queue paused (`/admin/jobs/tenants/:tenant_id/pause-jobs`
   pauses one tenant's jobs; the board can pause a whole queue)?
3. If several queues stall together: the checks of [worker-heartbeat-missing](#worker-heartbeat-missing).

### Mitigation

Resume a paused queue; restart a stuck consumer by forcing a new deployment; for a long job, see the lane note at the
top.

### Escalation

Not resolved in 30 minutes: escalate to the owner.

## outbox-backlog

**sev1.** The oldest committed outbox event has waited more than fifteen minutes to be published
(`app_outbox_oldest_unpublished_seconds`).

### What it means

A write commits its domain events in the same transaction, and they are normally published right after the commit.
The relay job on `bulk-ops` (every 10 s, for events older than 30 s) is the crash-recovery path. An event fifteen
minutes old means the relay is not running or keeps failing, so subscribers, webhooks and notifications behind those
events are late. Nothing is lost: the rows stay until published.

### First three checks

1. **The web page `/admin/timers`**: the durability strip shows the outbox backlog and its oldest age.
2. **Is a long job holding `bulk-ops`?** The Queues and jobs board, cron run time against the five-minute line, and
   the BullMQ board's active job on `bulk-ops`.
3. **Is the relay failing?** A relay that fails on one event logs a warning (`Outbox relay could not publish ...`,
   with an `err` field) and reports the error to Sentry with the tag `jobName:outbox-relay`. Loki,
   `{sel} | json | jobName="outbox-relay" | level=~"40|50|warn|error"`; Sentry, `jobName:outbox-relay`. The
   event's own `last_error` is on the row. Also check [worker-heartbeat-missing](#worker-heartbeat-missing): if it
   fires too, the lane is down, fix that.

### Mitigation

- Lane held by a long job: let it finish; then fix the job to stay under the budget, or move the relay and the sweep
  to their own queue (see the top). Do not raise this rule's window.
- Relay failing on one event (a bad payload): fix the code; the relay retries every sweep.

### Escalation

Not resolved in 30 minutes: escalate to the owner.

## deadline-sweep-late

**sev1.** The oldest pending deadline has been past its due time for more than fifteen minutes
(`app_deadline_oldest_due_seconds`).

### What it means

Timers are rows; the deadline sweep on `bulk-ops` fires due ones every 30 seconds. A deadline fifteen minutes late
means the sweep is not running or not reaching it, so whatever those timers do (expiries, reminders, follow-ups) has
not happened.

A handler that keeps failing does not trip this rule. A row whose last run threw has a last error and waits out its
own backoff, and the gauge leaves those rows out. Such a timer shows as FAILING on `/admin/timers`, and every failed
run is reported to Sentry with the tag `jobName:deadline-sweep`.

### First three checks

1. **The web page `/admin/timers`**: the overdue and failing counts, and the timers themselves with their kind and
   last error.
2. **Is a long job holding `bulk-ops`?** As for [outbox-backlog](#outbox-backlog).
3. **Is one kind failing?** A handler that throws, or a kind with no handler, logs a warning (with an `err`
   field) and reports the error to Sentry. Loki,
   `{sel} | json | jobName="deadline-sweep" | level=~"40|50|warn|error"`; Sentry, `jobName:deadline-sweep`. A
   failing row is retried after its backoff (up to one hour).

### Mitigation

As for [outbox-backlog](#outbox-backlog). A handler that cannot succeed for one deadline: fix the handler; a timer can
be cancelled in code with `DeadlineService.cancel`.

### Escalation

Not resolved in 30 minutes: escalate to the owner.

## cron-missed

**sev1.** For some cron, the last success (`app_cron_last_success_timestamp_seconds`) is older than twice its
expected interval (`app_cron_expected_interval_seconds`). The alert's `job_name` label names the cron.

### What it means

A scheduled job stopped running or stopped finishing, so the work it does stopped for every tenant. Only repeatables
that BullMQ holds, with an interval of a minute or more, have an expected interval: a schedule disabled in
`job_schedules` has none and never fires this. A cron whose every tenant failed does not stamp a success, so it fires
this too. A cron that has never succeeded since its stamp's look-back (eight days) has no stamp and is not reported
here; its failures reach [job-failed-final](#job-failed-final).

### First three checks

1. **Did it run and fail, or not run?**
   ```logql
   {sel} | json | jobName="<job_name>"
   ```
   Error lines mean it ran and failed (and [job-failed-final](#job-failed-final) likely fired). No lines mean it did
   not run.
2. **Is the whole lane stuck?** If [worker-heartbeat-missing](#worker-heartbeat-missing) fires too, fix that first.
3. **Is the schedule as expected?** `GET /admin/schedules`: the row's `pattern` (or `intervalMs`) and `isEnabled`. Schedules are
   registered at boot and when edited.

### Mitigation

Fix the cause, then let the next run complete (or force a new deployment, which re-registers the repeatables). Each
foundation cron is safe to run again. If the cron is no longer wanted, disable its schedule row: the interval series
goes away and so does the alert.

### Escalation

`trial-expiry` missed for more than a day (expired trials keep access): escalate to the owner. The others: working
hours.

## cron-tenants-failed

**sev2.** A cron finished (`cron.completed`) with `tenantsFailed` above zero in the last 25 hours. It resolves 25 hours
after the last partly failed run.

### What it means

The cron ran, but its work failed for one or more tenants. Each failure is in Sentry (source `cron`, tags `jobName`,
`tenantId`).

### First three checks

1. Which tenants? Sentry for `jobName:<jobName>`, or Loki:
   ```logql
   {sel} | json | jobName="<jobName>" | level=~"40|warning"
   ```
2. Open the Per-tenant health board for each tenant.
3. Same error for every failed tenant (a code bug) or different ones (their data)?

### Mitigation

Fix the cause; the next run picks the tenants up again.

### Escalation

None out of hours.
