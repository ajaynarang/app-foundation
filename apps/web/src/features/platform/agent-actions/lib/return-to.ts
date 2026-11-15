const APPROVE_PATH = /^\/agent-actions\/[A-Za-z0-9_-]+\/approve$/;

/**
 * Where to send a person back after they set a PIN, read from the page's `?returnTo=`: only an agent approval page of
 * this app, never anywhere else (no other path, no other origin), so the parameter cannot become an open redirect.
 */
export function agentActionReturnPath(search: string): string | null {
  const value = new URLSearchParams(search).get('returnTo');
  return value && APPROVE_PATH.test(value) ? value : null;
}
