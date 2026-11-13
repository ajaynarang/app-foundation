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
