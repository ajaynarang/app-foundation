import { CHAT_UNAVAILABLE_COPY, ChatRequestError, chatErrorCopy, chatRequestError } from '../chat-error';

const response = (status: number, body: string) =>
  ({ status, json: async () => JSON.parse(body) }) as unknown as Response;

describe('a refused chat turn', () => {
  it("shows the envelope's detail: the server wrote it for this reader", async () => {
    const detail = "AI isn't set up on this deployment yet. You can [connect your own AI key](/settings/ai).";
    const error = await chatRequestError(response(503, JSON.stringify({ statusCode: 503, code: 'X', detail })));
    expect(chatErrorCopy(error)).toBe(detail);
  });

  it('falls back to the generic line when the body is not the envelope', async () => {
    expect(chatErrorCopy(await chatRequestError(response(502, '<html>Bad gateway</html>')))).toBe(
      CHAT_UNAVAILABLE_COPY,
    );
    expect(chatErrorCopy(await chatRequestError(response(500, '{"error":"x"}')))).toBe(CHAT_UNAVAILABLE_COPY);
  });

  it('falls back to the generic line for a network failure', () => {
    expect(chatErrorCopy(new TypeError('Failed to fetch'))).toBe(CHAT_UNAVAILABLE_COPY);
    expect(chatErrorCopy(new ChatRequestError(500, null))).toBe(CHAT_UNAVAILABLE_COPY);
  });
});
