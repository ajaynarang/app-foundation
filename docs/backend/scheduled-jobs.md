---
title: Scheduled Jobs
description: SALLY's scheduling is database-driven — ScheduleManagerService + BullMQ repeat jobs. No @Cron decorators.
---

# Scheduled Jobs

The backend does **not** use `@nestjs/schedule` or `@Cron` decorators. Recurring work is database-driven: rows in the `JobSchedule` Prisma model define what should run, when, and against which queue. The `ScheduleManagerService` registers each enabled row as a BullMQ repeat job at startup.

The reason: schedules need to be controllable at runtime (enable, disable, re-time) without a redeploy, and they need to be auditable. Decorators don't give us either.

## Where it lives

| Piece | Where |
|---|---|
| Scheduler service | `apps/backend/src/infrastructure/queue/schedule-manager.service.ts` |
| Schedule rows | `JobSchedule` Prisma model in `apps/backend/prisma/schema.prisma` |
| Job categories → queue mapping | `apps/backend/src/infrastructure/queue/job.types.ts` (`JOB_CATEGORIES`) |
| Queue constants | `apps/backend/src/infrastructure/queue/queue.constants.ts` |

The scheduler injects the queues it manages — currently `FLEET_PIPELINE`, `COMPLIANCE`, `LANES`, `MAINTENANCE`, `DOCUMENTS`, `WEBHOOKS`, `ACCOUNTING`, `OAUTH`, `OPERATIONS`, `ROUTE_PLAN_PROGRESS`, and `NOTIFICATIONS`.

## How it works at startup

1. Backend starts, NestJS bootstraps the module graph.
2. `ScheduleManagerService` reads `JobSchedule` rows from Postgres.
3. For each row where `is_enabled = true`, it registers a BullMQ repeat job into the queue mapped by `JOB_CATEGORIES[row.category]`.
4. BullMQ workers (also in-process) pick up the recurring job and execute it.

If you change a schedule row while the backend is running, **the change takes effect on the next restart** (or on an explicit schedule reload — see the admin surface).

## Reading the schedules

```bash
cd apps/backend
doppler run -- pnpm prisma:studio
# Open the JobSchedule table
```

Or via SQL:

```sql
SELECT category, job_type, cron_expression, is_enabled, last_ran_at
FROM job_schedule
ORDER BY category, job_type;
```

## Adding a new recurring job

1. **Pick the category** (and therefore the queue). If none fits, you may need a new queue — see [Events & Queues](events-queues.md).

2. **Implement the job handler** as part of the queue's processor — see the queue's existing processor in the relevant domain (e.g. `apps/backend/src/domains/operations/shield/services/shield-audit.processor.ts`).

3. **Insert a `JobSchedule` row** via seed or migration:

    ```ts
    // In a seed or migration script
    await prisma.jobSchedule.create({
      data: {
        category: 'COMPLIANCE',
        job_type: 'shield-hourly-sweep',
        cron_expression: '0 * * * *',
        is_enabled: true,
        // job-specific config
      },
    });
    ```

4. **Restart the backend** (or call the schedule reload endpoint if you've added one).

For non-recurring scheduled work (run once at a specific time), use BullMQ's `delay` option instead of `JobSchedule` — no new infrastructure needed:

```ts
await this.maintenanceQueue.add(
  'tenant-trial-reminder',
  { tenantId },
  { delay: msUntilReminder },
);
```

## Don't reach for `@Cron`

If you find yourself typing `import { Cron } from '@nestjs/schedule'`, stop. The reason it isn't in the codebase:

- A cron annotation runs on every pod. We run one pod per service in production, but the model isn't worth assuming forever. The `JobSchedule` table is single-source-of-truth and gives us single-leader semantics through BullMQ.
- Schedules need to be editable at runtime. Annotation-based scheduling means a redeploy to change a cron expression. Not viable.
- Schedules need to be auditable — `JobSchedule` carries `last_ran_at`, `last_outcome`, etc.

If you genuinely need an annotation-based schedule for a one-shot prototype, talk to the team first.

## Manual triggers

For ad-hoc job runs (replay yesterday's compliance sweep, retry a stuck integration sync), the admin surface at `/admin/jobs` triggers jobs directly. The backing endpoint is `apps/backend/src/domains/admin/admin-jobs.controller.ts` — it accepts a queue name + job name + payload and pushes the job.

## Observability

- Job lifecycle (added, started, completed, failed, retried) is logged through Pino. Filter Loki by the queue name to follow a queue's activity.
- `DomainEvent`s emitted from inside a job flow through the same event bus — they show up in `DomainEventLog` and in SSE.
- BullMQ retries are logged with the attempt number; final failures land in BullMQ's failed-job set and surface in the admin UI.

## Local development

The Inngest dev server (UI on `:8288`) auto-starts with `docker-compose up -d` and powers Sally's Desk workflows, but it doesn't manage BullMQ. To see BullMQ jobs run locally, just `pnpm doppler:backend` — the backend hosts the workers in-process. Logs in the terminal.
