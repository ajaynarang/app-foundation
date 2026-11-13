/** What the chat says when a turn fails and the server gave no reason a person can act on. */
export const CHAT_UNAVAILABLE_COPY = "I'm having trouble connecting right now. Please try again in a moment.";

/** A chat request the server refused before streaming, carrying the envelope's `detail` when it sent one. */
export class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ChatRequestError';
  }
}

/**
 * Reads the error envelope a refused chat request answers with (before its stream starts). Its `detail` is copy the
 * server wrote for this reader (the not-configured answer, say, which tells only a workspace owner where to connect
 * a key), so the chat shows it. A body that is not the envelope yields no detail.
 */
export async function chatRequestError(response: Response): Promise<ChatRequestError> {
  let detail: string | null = null;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
      detail = (body as { detail: string }).detail;
    }
  } catch {
    detail = null;
  }
  return new ChatRequestError(response.status, detail);
}

/** The assistant bubble's text for a failed turn: the server's own reason when it gave one, else the generic line. */
export function chatErrorCopy(error: unknown): string {
  return error instanceof ChatRequestError && error.detail ? error.detail : CHAT_UNAVAILABLE_COPY;
}
