/**
 * The error Mastra recorded on a stream that ended early, if any. Mastra often records a provider failure on
 * `response.error` and closes the text stream normally instead of throwing from the read, so every reader of an agent
 * stream checks this after its read loop. Never throws.
 */
export function readStreamError(response: unknown): unknown {
  try {
    return (response as { error?: unknown } | null | undefined)?.error;
  } catch {
    return undefined;
  }
}
