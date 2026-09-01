import { createHmac } from 'crypto';
import { InteraktWhatsAppAdapter } from '../interakt.adapter';
import type { WhatsAppTemplateSend } from '../whatsapp.port';

describe('InteraktWhatsAppAdapter', () => {
  let adapter: InteraktWhatsAppAdapter;
  let fetchMock: jest.Mock;
  const send: WhatsAppTemplateSend = {
    to: '+919876543210',
    templateName: 'tx_x_v1',
    languageCode: 'en',
    bodyValues: ['a', 'b'],
    callbackData: 'd1',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    adapter = new InteraktWhatsAppAdapter({ apiKey: 'k', webhookSecret: 's' });
  });

  describe('sendTemplate', () => {
    it('posts a template with the number split the way Interakt wants it', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ result: true, id: 'im_1' }) });

      const { providerMessageId } = await adapter.sendTemplate(send);

      expect(providerMessageId).toBe('im_1');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.interakt.ai/v1/public/message/');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Basic k', 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({
        countryCode: '+91',
        phoneNumber: '9876543210',
        type: 'Template',
        callbackData: 'd1',
        template: { name: 'tx_x_v1', languageCode: 'en', bodyValues: ['a', 'b'] },
      });
    });

    it('a 429 or 5xx is retryable; a 4xx is not; a network error is', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'slow down' });
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: true });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' });
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: true });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad template' });
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: false });
      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: true });
    });

    it('a 2xx without an id is a provider error, not a send', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: false, message: 'nope' }) });
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({
        retryable: false,
        message: expect.stringContaining('nope'),
      });
    });

    it('strips a trunk zero libphonenumber keeps — Interakt wants the bare national number', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ result: true, id: 'im_it' }) });
      await adapter.sendTemplate({ ...send, to: '+390612345678' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        countryCode: '+39',
        phoneNumber: '612345678',
      });
    });

    it('a number that is not E.164 is refused before any request', async () => {
      await expect(adapter.sendTemplate({ ...send, to: '98765' })).rejects.toMatchObject({ retryable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never puts the phone number in an error message — even when the provider echoes it', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid phoneNumber: 919876543210',
      });
      const err = await adapter.sendTemplate(send).catch((e) => e);
      expect(String(err.message)).not.toMatch(/9876543210/);
    });
  });

  describe('verifySignature', () => {
    it('accepts the sha256= HMAC of the raw body and rejects everything else', () => {
      const raw = Buffer.from('{"a":1}');
      const good = 'sha256=' + createHmac('sha256', 's').update(raw).digest('hex');
      expect(adapter.verifySignature(raw, good)).toBe(true);
      expect(adapter.verifySignature(raw, 'sha256=' + '0'.repeat(64))).toBe(false);
      expect(adapter.verifySignature(raw, 'sha256=abc')).toBe(false);
      // Same length as a real digest but not hex: decodes SHORT — must be false, never a throw.
      expect(adapter.verifySignature(raw, 'sha256=' + 'a'.repeat(62) + 'zz')).toBe(false);
      expect(adapter.verifySignature(raw, undefined)).toBe(false);
      expect(adapter.verifySignature(undefined, good)).toBe(false);
      expect(adapter.verifySignature(raw, 'md5=' + createHmac('sha256', 's').update(raw).digest('hex'))).toBe(false);
    });
  });

  describe('parseWebhook', () => {
    it.each([
      ['message_api_sent', 'SENT', 'received_at_utc'],
      ['message_api_delivered', 'DELIVERED', 'delivered_at_utc'],
      ['message_api_read', 'READ', 'received_at_utc'],
    ])('maps %s to a %s status event', (type, status, tsField) => {
      const [ev] = adapter.parseWebhook({
        version: '1.0',
        type,
        data: { message: { id: 'im_9', [tsField]: '2026-08-31T10:00:00Z' } },
      });
      expect(ev).toMatchObject({
        kind: 'status',
        providerMessageId: 'im_9',
        status,
        at: new Date('2026-08-31T10:00:00Z'),
      });
    });

    it('falls back to the webhook timestamp, then now, when the message carries no time', () => {
      const [ev] = adapter.parseWebhook({
        type: 'message_api_sent',
        timestamp: '2026-08-31T09:00:00Z',
        data: { message: { id: 'im_9' } },
      });
      expect(ev).toMatchObject({ kind: 'status', at: new Date('2026-08-31T09:00:00Z') });
      const before = Date.now();
      const [ev2] = adapter.parseWebhook({ type: 'message_api_sent', data: { message: { id: 'im_9' } } });
      expect((ev2 as any).at.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('maps message_api_failed to FAILED with our reason, not the provider text', () => {
      const [ev] = adapter.parseWebhook({
        type: 'message_api_failed',
        data: { message: { id: 'im_9', channel_failure_reason: 'Not a WhatsApp user', channel_error_code: 131026 } },
      });
      expect(ev).toEqual({
        kind: 'status',
        providerMessageId: 'im_9',
        status: 'FAILED',
        at: expect.any(Date),
        failureReason: 'PROVIDER_ERROR',
      });
    });

    it('carries the echoed callback data (our ledger id) on status events', () => {
      const [ev] = adapter.parseWebhook({
        type: 'message_api_sent',
        data: {
          message: {
            id: 'im_9',
            received_at_utc: '2026-08-31T10:00:00Z',
            meta_data: { source_data: { callback_data: 'd1' } },
          },
        },
      });
      expect(ev).toMatchObject({ kind: 'status', providerMessageId: 'im_9', callbackData: 'd1' });
      expect(
        adapter.parseWebhook({ type: 'message_api_sent', data: { message: { id: 'im_9' } } })[0],
      ).not.toHaveProperty('callbackData');
    });

    it("maps Meta's marketing cap (131049) to MARKETING_CAP, as a number or a string", () => {
      for (const code of [131049, '131049']) {
        const [ev] = adapter.parseWebhook({
          type: 'message_api_failed',
          data: { message: { id: 'im_9', channel_error_code: code } },
        });
        expect(ev).toMatchObject({ kind: 'status', status: 'FAILED', failureReason: 'MARKETING_CAP' });
      }
    });

    it('surfaces an inbound message with its sender in E.164 and its text', () => {
      expect(
        adapter.parseWebhook({
          type: 'message_received',
          data: { customer: { channel_phone_number: '919876543210' }, message: { message: 'STOP' } },
        }),
      ).toEqual([{ kind: 'inbound', from: '+919876543210', text: 'STOP' }]);
    });

    it('yields nothing for anything it does not understand', () => {
      expect(adapter.parseWebhook({ type: 'something_else' })).toEqual([]);
      expect(adapter.parseWebhook(null)).toEqual([]);
      expect(adapter.parseWebhook('str')).toEqual([]);
      expect(adapter.parseWebhook({ type: 'message_api_sent', data: {} })).toEqual([]);
      expect(adapter.parseWebhook({ type: 'message_received', data: { message: { message: 'hi' } } })).toEqual([]);
    });
  });
});
