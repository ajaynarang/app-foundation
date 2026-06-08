import { z } from 'zod';

/**
 * Standard job envelope wrapping every payload sent to BullMQ queues.
 *
 * Every queue producer wraps its payload in this envelope via
 * `buildJobEnvelope` (apps/backend/src/infrastructure/queue/job-envelope.helper.ts)
 * so that:
 *   - `correlationId` propagates a single trace identifier across jobs
 *   - `causationId` records what triggered the job (request id, parent job id, event id)
 *   - `tenantId` is the wire-format slug (NOT the int DB id) — workers resolve
 *     to the DB id via TenantIdResolver
 *   - `metadata.source` tags how the job was enqueued (api / cron / event /
 *     replay / webhook) so the system-activity dashboard and dead-letter log
 *     can attribute failures correctly
 *   - `metadata.version` lets us evolve the envelope safely
 */
export const JobEnvelopeSchema = z.object({
  tenantId: z.string(),
  causationId: z.string().optional(),
  correlationId: z.string(),
  userId: z.string().optional(),
  payload: z.unknown(),
  metadata: z.object({
    enqueuedAt: z.string(),
    source: z.enum(['api', 'cron', 'event', 'replay', 'webhook']),
    version: z.literal(1),
  }),
});

export type JobEnvelope<P = unknown> = Omit<z.infer<typeof JobEnvelopeSchema>, 'payload'> & {
  payload: P;
};
