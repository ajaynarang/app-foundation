import {
  CitationSchema,
  ReadingFrameSchema,
  STREAM_FRAME,
  STREAM_FRAME_CODE_LENGTH,
  type Citation,
  type ReadingFrame,
} from '@app/shared-types';
import type { ChatMessage, RichCard } from '../engine/types';
import { CHAT_UNAVAILABLE_COPY } from './chat-error';

export { STREAM_FRAME } from '@app/shared-types';

/**
 * Reading the assistant's chat stream: one frame per line, a two-character code then its payload (`STREAM_FRAME` in
 * `@app/shared-types`, the table the backend writes from).
 *
 * The rule: a frame whose code this reader does not know is skipped, and so is a frame whose payload does not parse.
 * The web and the backend deploy separately, so either may be ahead: an older web shows what it understands of a newer
 * backend's stream and drops the rest, and nothing is required of the deploy order.
 */

/** What a turn's frames do to the chat. Each callback is optional; a frame with no callback is skipped. */
export interface FrameHandlers {
  text?: (delta: string) => void;
  card?: (card: RichCard) => void;
  suspend?: (payload: Record<string, unknown>) => void;
  followups?: (followUps: string[]) => void;
  citation?: (citation: Citation) => void;
  reading?: (frame: ReadingFrame) => void;
  /** The terminal `x:` frame: the turn failed after it began. */
  error?: (error: StreamError) => void;
}

/** The payload of a frame line, after its two-character code. */
export function framePayload(line: string): string {
  return line.slice(STREAM_FRAME_CODE_LENGTH);
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

/** A citation frame's payload, or null when it is not a valid citation (it is skipped, never rendered). */
export function parseCitation(payload: string): Citation | null {
  const parsed = CitationSchema.safeParse(parseJson(payload));
  return parsed.success ? parsed.data : null;
}

/** A reading frame's payload, or null when it is malformed. */
export function parseReadingFrame(payload: string): ReadingFrame | null {
  const parsed = ReadingFrameSchema.safeParse(parseJson(payload));
  return parsed.success ? parsed.data : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Hand one line of the stream to its handler. Returns false when the line was skipped: blank, an unknown code, or a
 * payload that does not parse.
 */
export function dispatchFrame(line: string, handlers: FrameHandlers): boolean {
  const trimmed = line.trim();
  if (trimmed.length < STREAM_FRAME_CODE_LENGTH) return false;
  const code = trimmed.slice(0, STREAM_FRAME_CODE_LENGTH);
  const payload = framePayload(trimmed);

  switch (code) {
    case STREAM_FRAME.TEXT: {
      const text = parseJson(payload);
      if (typeof text !== 'string') return false;
      handlers.text?.(text);
      return true;
    }
    case STREAM_FRAME.CARD: {
      const card = parseJson(payload);
      if (!isRecord(card)) return false;
      handlers.card?.(card as unknown as RichCard);
      return true;
    }
    case STREAM_FRAME.SUSPEND: {
      const suspend = parseJson(payload);
      if (!isRecord(suspend)) return false;
      handlers.suspend?.(suspend);
      return true;
    }
    case STREAM_FRAME.FOLLOWUPS: {
      const followUps = parseJson(payload);
      if (!Array.isArray(followUps)) return false;
      handlers.followups?.(followUps.filter((f): f is string => typeof f === 'string'));
      return true;
    }
    case STREAM_FRAME.CITATION: {
      const citation = parseCitation(payload);
      if (!citation) return false;
      handlers.citation?.(citation);
      return true;
    }
    case STREAM_FRAME.READING: {
      const reading = parseReadingFrame(payload);
      if (!reading) return false;
      handlers.reading?.(reading);
      return true;
    }
    case STREAM_FRAME.ERROR:
      handlers.error?.(parseErrorFrame(payload));
      return true;
    default:
      // A frame from a newer backend: skipped, never an error.
      return false;
  }
}

/**
 * Read a streamed response body to the end, handing each complete line to its handler. A line split across network
 * chunks is held until its newline arrives.
 */
export async function readFrames(body: ReadableStream<Uint8Array>, handlers: FrameHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) dispatchFrame(line, handlers);
  }
  buffer += decoder.decode();
  if (buffer) dispatchFrame(buffer, handlers);
}

export function updatePlaceholder(
  messages: ChatMessage[],
  placeholderId: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((m) => (m.id === placeholderId ? update(m) : m));
}

/** `t:`: the assistant names what it is reading. Transient, never persisted. */
export function applyReadingFrame(message: ChatMessage, frame: ReadingFrame): ChatMessage {
  return { ...message, reading: frame };
}

/** `c:`: a source the answer named. The reading line has done its job. */
export function applyCitationFrame(message: ChatMessage, citation: Citation): ChatMessage {
  const existing = message.citations ?? [];
  const isKnown = existing.some((c) => c.sourceType === citation.sourceType && c.sourceId === citation.sourceId);
  return { ...message, reading: null, citations: isKnown ? existing : [...existing, citation] };
}

/** Text arrived, or the turn ended: the reading line clears. */
export function settleMessage(message: ChatMessage): ChatMessage {
  return message.reading ? { ...message, reading: null } : message;
}

/** A turn that failed with a reason the person can act on: its message is the server's `detail`. */
export class StreamError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

/** The terminal `x:` frame `{ code, detail }`. A malformed one reads as the generic copy. */
export function parseErrorFrame(payload: string): StreamError {
  const frame = parseJson(payload);
  if (isRecord(frame) && typeof frame.detail === 'string' && frame.detail) {
    return new StreamError(frame.detail, typeof frame.code === 'string' ? frame.code : null);
  }
  return new StreamError(CHAT_UNAVAILABLE_COPY);
}

/** The text a failed turn shows: whatever streamed before the failure, then why it stopped. */
export function failedTurnText(partial: string, error: unknown): string {
  const reason = error instanceof StreamError ? error.message : CHAT_UNAVAILABLE_COPY;
  return partial ? `${partial}\n\n${reason}` : reason;
}
