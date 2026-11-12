import type { Citation } from '@app/shared-types';
import type { ChatMessage } from '../../engine/types';
import { CHAT_UNAVAILABLE_COPY } from '../chat-error';
import {
  STREAM_FRAME,
  StreamError,
  applyCitationFrame,
  applyReadingFrame,
  dispatchFrame,
  failedTurnText,
  framePayload,
  parseCitation,
  parseErrorFrame,
  parseReadingFrame,
  readFrames,
  settleMessage,
  updatePlaceholder,
  type FrameHandlers,
} from '../stream-frames';

const base: ChatMessage = { id: 'm', role: 'assistant', content: '', inputMode: 'text', timestamp: new Date(0) };
const GUIDE: Citation = { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'kb_1', title: 'Getting started' };

/** Every handler a jest mock, so a test can see which one a line reached. */
function spyHandlers() {
  return {
    text: jest.fn(),
    card: jest.fn(),
    suspend: jest.fn(),
    followups: jest.fn(),
    citation: jest.fn(),
    reading: jest.fn(),
    error: jest.fn(),
  } satisfies Required<FrameHandlers>;
}
const calledHandlers = (handlers: ReturnType<typeof spyHandlers>) =>
  Object.entries(handlers)
    .filter(([, fn]) => fn.mock.calls.length > 0)
    .map(([name]) => name);

/** A response body that arrives in the given network chunks. */
function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('stream frames', () => {
  it('a reading frame shows what the assistant is reading', () => {
    expect(applyReadingFrame(base, { title: 'Getting started' }).reading).toEqual({ title: 'Getting started' });
  });

  it('a citation lands on the message and clears the reading line', () => {
    const cited = applyCitationFrame(applyReadingFrame(base, { title: 'Getting started' }), GUIDE);
    expect(cited.citations).toEqual([GUIDE]);
    expect(cited.reading).toBeNull();
  });

  it('dedupes the same citation', () => {
    expect(applyCitationFrame(applyCitationFrame(base, GUIDE), GUIDE).citations).toEqual([GUIDE]);
  });

  it('settling clears reading and keeps citations', () => {
    const settled = settleMessage({ ...applyCitationFrame(base, GUIDE), reading: { title: 'x' } });
    expect(settled.reading).toBeNull();
    expect(settled.citations).toEqual([GUIDE]);
  });

  it('settling a message with nothing to clear returns it unchanged', () => {
    expect(settleMessage(base)).toBe(base);
  });
});

describe('frame parsing', () => {
  it('reads a frame payload after its two-character code', () => {
    expect(framePayload(`${STREAM_FRAME.CITATION}{"a":1}`)).toBe('{"a":1}');
  });

  it('accepts a well-formed citation', () => {
    expect(parseCitation(JSON.stringify(GUIDE))).toEqual(GUIDE);
  });

  it('drops a citation without a source id instead of rendering it', () => {
    expect(parseCitation(JSON.stringify({ sourceType: 'KNOWLEDGE_DOCUMENT', title: 'x' }))).toBeNull();
    expect(parseCitation('not json')).toBeNull();
  });

  it('drops a reading frame with no title', () => {
    expect(parseReadingFrame('{}')).toBeNull();
  });

  it('updates only the placeholder message', () => {
    const other = { ...base, id: 'other' };
    const [updated, untouched] = updatePlaceholder([base, other], 'm', (m) => ({ ...m, content: 'x' }));
    expect(updated.content).toBe('x');
    expect(untouched).toBe(other);
  });
});

describe('dispatching frames', () => {
  it('hands each known frame to its own handler', () => {
    const handlers = spyHandlers();
    dispatchFrame(`0:${JSON.stringify('Hello')}`, handlers);
    dispatchFrame('8:{"type":"text","data":{}}', handlers);
    dispatchFrame('9:{"action":"Create"}', handlers);
    dispatchFrame('a:["Next?"]', handlers);
    dispatchFrame(`c:${JSON.stringify(GUIDE)}`, handlers);
    dispatchFrame('t:{"title":"Getting started"}', handlers);
    dispatchFrame('x:{"code":"AI_BUDGET_EXCEEDED","detail":"Limit reached"}', handlers);

    expect(handlers.text).toHaveBeenCalledWith('Hello');
    expect(handlers.followups).toHaveBeenCalledWith(['Next?']);
    expect(handlers.citation).toHaveBeenCalledWith(GUIDE);
    expect(handlers.reading).toHaveBeenCalledWith({ title: 'Getting started' });
    const error = handlers.error.mock.calls[0][0] as StreamError;
    expect(error.message).toBe('Limit reached');
    expect(error.code).toBe('AI_BUDGET_EXCEEDED');
    expect(calledHandlers(handlers)).toHaveLength(7);
  });

  it('skips a frame whose code it does not know: a newer backend may send one', () => {
    const handlers = spyHandlers();
    expect(dispatchFrame('z:{"anything":true}', handlers)).toBe(false);
    expect(dispatchFrame('q:"text"', handlers)).toBe(false);
    expect(calledHandlers(handlers)).toEqual([]);
  });

  it('skips a known frame whose payload does not parse, and a blank line', () => {
    const handlers = spyHandlers();
    expect(dispatchFrame('0:not json', handlers)).toBe(false);
    expect(dispatchFrame('a:{"not":"an array"}', handlers)).toBe(false);
    expect(dispatchFrame('', handlers)).toBe(false);
    expect(calledHandlers(handlers)).toEqual([]);
  });

  it('reads a whole body, joining a line split across network chunks and skipping unknown frames', async () => {
    const handlers = spyHandlers();
    await readFrames(bodyOf(['0:"Hel', 'lo"\nz:{"new":1}\n0:" world"\n', `c:${JSON.stringify(GUIDE)}`]), handlers);

    expect(handlers.text.mock.calls.map((c) => c[0])).toEqual(['Hello', ' world']);
    expect(handlers.citation).toHaveBeenCalledWith(GUIDE);
    expect(calledHandlers(handlers)).toEqual(['text', 'citation']);
  });
});

describe('a turn that fails after it began', () => {
  it('an x: frame carries its detail; a malformed one the generic copy', () => {
    expect(parseErrorFrame('{"code":"INTERNAL","detail":"The assistant stopped"}').message).toBe(
      'The assistant stopped',
    );
    expect(parseErrorFrame('nope').message).toBe(CHAT_UNAVAILABLE_COPY);
    expect(parseErrorFrame('{"code":"INTERNAL"}').message).toBe(CHAT_UNAVAILABLE_COPY);
  });

  it('keeps what streamed and says why it stopped', () => {
    expect(failedTurnText('', new StreamError('Budget reached'))).toBe('Budget reached');
    expect(failedTurnText('Half an answer', new StreamError('Budget reached'))).toBe(
      'Half an answer\n\nBudget reached',
    );
    expect(failedTurnText('', new TypeError('fetch failed'))).toBe(CHAT_UNAVAILABLE_COPY);
  });
});
