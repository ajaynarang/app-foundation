import { NonRetriableError } from 'inngest';
import { RLS_SOURCE, runAsTenant, toRlsTenantId } from '@appshore/kernel/infrastructure/rls/rls-context';
import { loadEpisodeTenantId } from './episode-tenant';

/** The slice of Inngest's `step` that `deskStep` needs. */
export interface DeskStepRunner {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
}

/** Every per-tenant Desk event carries the episode and its tenant (the tenant DB id, or its decimal string). */
export interface DeskTenantEvent {
  data: { episodeId: string; tenantId: number | string };
}

/**
 * The event and the episode disagree about the tenant, or the event names no tenant. Retrying cannot fix either, so
 * it is non-retriable: Inngest fails the step at once instead of spending its retries.
 */
export class DeskTenantMismatchError extends NonRetriableError {
  constructor(message: string) {
    super(message);
    this.name = 'DeskTenantMismatchError';
  }
}

function eventTenant(event: DeskTenantEvent, name: string): number {
  const tenantId = toRlsTenantId(event.data.tenantId);
  if (tenantId === undefined) {
    throw new DeskTenantMismatchError(
      `Desk step ${name} for episode ${event.data.episodeId}: event has no usable tenant id (${String(event.data.tenantId)})`,
    );
  }
  return tenantId;
}

/**
 * `step.run` for a per-tenant Desk workflow.
 *
 * The tenant context does not cross an Inngest step boundary: every step is a fresh HTTP invocation that replays the
 * handler, and the code around `step.run` runs outside any request scope. So each step re-enters the event's tenant
 * itself (`desk:<step>`), and before running `fn` checks that the episode it works on belongs to that tenant. A
 * mismatch, or an episode the tenant cannot see, throws a non-retriable error instead of letting one tenant's event
 * act on another tenant's episode.
 *
 * Keep every Prisma call inside a `deskStep`: code between steps runs with no tenant context.
 */
export async function deskStep<T>(
  step: DeskStepRunner,
  event: DeskTenantEvent,
  name: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const { episodeId } = event.data;
  const tenantId = eventTenant(event, name);

  return step.run(name, () =>
    runAsTenant(tenantId, `${RLS_SOURCE.DESK}:${name}`, async () => {
      const owner = await loadEpisodeTenantId(episodeId);
      if (owner !== tenantId) {
        throw new DeskTenantMismatchError(
          `Desk step ${name}: episode ${episodeId} belongs to tenant ${String(owner)}, event names tenant ${tenantId}`,
        );
      }
      return fn();
    }),
  );
}

/**
 * A workflow's terminal escalate-and-close step. It still runs as the event's tenant, but skips the episode check: it
 * must always run, even when the failure it escalates was that check. Once row-level security is enforced, an episode
 * owned by another tenant is invisible here, so the close does nothing to it.
 */
export async function deskEscalationStep<T>(
  step: DeskStepRunner,
  event: DeskTenantEvent,
  name: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const tenantId = eventTenant(event, name);
  return step.run(name, () => runAsTenant(tenantId, `${RLS_SOURCE.DESK}:${name}`, async () => fn()));
}
