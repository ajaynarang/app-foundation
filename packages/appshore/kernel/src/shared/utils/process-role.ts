/**
 * Which entry point booted this process. main.ts (HTTP API) and worker.ts
 * (background worker, no HTTP listener) load the same AppModule, so providers
 * that need an HTTP server in their own process ask this. worker.ts claims
 * 'worker' before creating the app; everything else (main.ts, tests, scripts) is 'api'.
 */
export type ProcessRole = 'api' | 'worker';

let processRole: ProcessRole = 'api';

export function setProcessRole(role: ProcessRole): void {
  processRole = role;
}

export function getProcessRole(): ProcessRole {
  return processRole;
}

/**
 * Whether this process reports the ops gauges: the queue depths, the cron intervals, and the outbox and deadline
 * ages. Exactly one process role reports them, so nothing is counted twice. Normally that is the worker. With no
 * worker task (`worker_desired_count = 0`) the API consumes every queue, and Terraform then sets
 * `OPS_GAUGES_FROM_API=true` on the API task so the gauges still exist. Set the key only there, never in Doppler.
 * Unset (or any other value) means the API does not report. Several API tasks then each report the same reading,
 * which is why every rule and panel on these gauges aggregates with `max`, never `sum`.
 */
export function reportsOpsGauges(env: NodeJS.ProcessEnv = process.env): boolean {
  if (processRole === 'worker') return true;
  return env.OPS_GAUGES_FROM_API?.trim().toLowerCase() === 'true';
}
