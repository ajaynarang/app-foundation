import { createHmac } from 'crypto';
import { MetaCloudWhatsAppAdapter } from '../meta-cloud.adapter';
import type { WhatsAppTemplateSend } from '../whatsapp.port';

describe('MetaCloudWhatsAppAdapter', () => {
  let adapter: MetaCloudWhatsAppAdapter;
  let fetchMock: jest.Mock;
  const send: WhatsAppTemplateSend = {
    to: '+919876543210',
    templateName: 'tx_draw_published_v1',
    languageCode: 'en',
    bodyValues: ['Monsoon Open', 'Men’s singles'],
    callbackData: '01a0-ledger',
  };
  const accepted = (id = 'wamid.HBgL') => ({
    ok: true,
    status: 200,
    json: async () => ({ messaging_product: 'whatsapp', contacts: [{ wa_id: '919876543210' }], messages: [{ id }] }),
  });
  const refused = (status: number, code: number, details = 'no') => ({
    ok: false,
    status,
    json: async () => ({ error: { message: 'x', code, error_data: { messaging_product: 'whatsapp', details } } }),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    adapter = new MetaCloudWhatsAppAdapter({
      accessToken: 'tok',
      appSecret: 'app-secret',
      phoneNumberId: '1065551234',
      verifyToken: 'verify-me',
    });
  });

  describe('sendTemplate', () => {
    it('posts the template to the phone-number id with the digits, the language object and positional body params', async () => {
      fetchMock.mockResolvedValue(accepted('wamid.1'));
      await expect(adapter.sendTemplate(send)).resolves.toEqual({ providerMessageId: 'wamid.1' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v25.0/1065551234/messages');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '919876543210',
        type: 'template',
        template: {
          name: 'tx_draw_published_v1',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Monsoon Open' },
                { type: 'text', text: 'Men’s singles' },
              ],
            },
          ],
        },
        biz_opaque_callback_data: '01a0-ledger',
      });
    });

    it('omits components for a template without variables, and the callback field when there is none', async () => {
      fetchMock.mockResolvedValue(accepted());
      await adapter.sendTemplate({ ...send, bodyValues: [], callbackData: undefined });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.template).toEqual({ name: 'tx_draw_published_v1', language: { code: 'en' } });
      expect(body).not.toHaveProperty('biz_opaque_callback_data');
    });

    it('talks to an emulator or a fake when given a base URL, with or without a trailing slash', async () => {
      fetchMock.mockResolvedValue(accepted());
      for (const baseUrl of ['http://localhost:4004/v25.0', 'http://localhost:4004/v25.0/']) {
        const local = new MetaCloudWhatsAppAdapter({ accessToken: 't', appSecret: 's', phoneNumberId: '1', baseUrl });
        await local.sendTemplate(send);
        expect(fetchMock.mock.calls.at(-1)[0]).toBe('http://localhost:4004/v25.0/1/messages');
      }
    });

    it('a number that is not E.164 is refused before any request', async () => {
      await expect(adapter.sendTemplate({ ...send, to: '98765' })).rejects.toMatchObject({ retryable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['HTTP 429', refused(429, 4), true],
      ['HTTP 503', refused(503, 2), true],
      ['account rate limit 80007', refused(400, 80007), true],
      ['throughput 130429', refused(400, 130429), true],
      ['pair rate limit 131056', refused(400, 131056), true],
      ['service unavailable 131016', refused(400, 131016), true],
      ['unknown delivery error 131000', refused(400, 131000), true],
      ['bad parameter 100', refused(400, 100), false],
      ['not a WhatsApp user 131026', refused(400, 131026), false],
      ['template param mismatch 132000', refused(400, 132000), false],
      ['expired token 190', refused(401, 190), false],
    ])('%s → retryable=%s', async (_label, response, retryable) => {
      fetchMock.mockResolvedValue(response);
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable, name: 'WhatsAppSendError' });
    });

    it("names Meta's marketing cap so the row reads MARKETING_CAP, and never retries it", async () => {
      fetchMock.mockResolvedValue(refused(400, 131049, 'Marketing message limit reached'));
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({
        retryable: false,
        failureReason: 'MARKETING_CAP',
      });
    });

    it('a network failure is retryable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: true });
    });

    it('a 2xx without a message id is a provider error, not a send', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp' }) });
      await expect(adapter.sendTemplate(send)).rejects.toMatchObject({ retryable: false });
    });

    it('never puts the phone number in an error message — even when Meta echoes it', async () => {
      fetchMock.mockResolvedValue(refused(400, 131026, 'Recipient 919876543210 is not a WhatsApp user'));
      await expect(adapter.sendTemplate(send)).rejects.toThrow(/<digits>/);
      await expect(adapter.sendTemplate(send)).rejects.not.toThrow(/919876543210/);
    });
  });

  describe('verifySignature', () => {
    it('accepts the sha256= HMAC of the raw body under the APP SECRET and rejects everything else', () => {
      const raw = Buffer.from('{"object":"whatsapp_business_account"}');
      const good = 'sha256=' + createHmac('sha256', 'app-secret').update(raw).digest('hex');
      expect(adapter.verifySignature(raw, good)).toBe(true);
      expect(adapter.verifySignature(raw, 'sha256=' + createHmac('sha256', 'tok').update(raw).digest('hex'))).toBe(
        false,
      );
      expect(adapter.verifySignature(raw, 'sha256=' + 'a'.repeat(62) + 'zz')).toBe(false);
      expect(adapter.verifySignature(raw, undefined)).toBe(false);
      expect(adapter.verifySignature(undefined, good)).toBe(false);
    });
  });

  describe('verifyChallenge', () => {
    it('echoes the challenge only for a subscribe with our verify token', () => {
      const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '1158201444' };
      expect(adapter.verifyChallenge(query)).toBe('1158201444');
      expect(adapter.verifyChallenge({ ...query, 'hub.verify_token': 'wrong' })).toBeNull();
      expect(adapter.verifyChallenge({ ...query, 'hub.mode': 'unsubscribe' })).toBeNull();
      expect(adapter.verifyChallenge({ ...query, 'hub.challenge': ['a'] })).toBeNull();
      expect(adapter.verifyChallenge({})).toBeNull();
    });

    it('refuses everything when no verify token was configured', () => {
      const bare = new MetaCloudWhatsAppAdapter({ accessToken: 't', appSecret: 's', phoneNumberId: '1' });
      expect(
        bare.verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': undefined, 'hub.challenge': '1' }),
      ).toBeNull();
    });
  });

  describe('parseWebhook', () => {
    const hook = (value: Record<string, unknown>) => ({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }],
    });

    it.each([
      ['sent', 'SENT'],
      ['delivered', 'DELIVERED'],
      ['read', 'READ'],
    ])('maps a %s status to %s with the unix timestamp and our echoed callback data', (status, mapped) => {
      const events = adapter.parseWebhook(
        hook({
          statuses: [
            {
              id: 'wamid.9',
              status,
              timestamp: '1756634400',
              recipient_id: '919876543210',
              biz_opaque_callback_data: 'd1',
            },
          ],
        }),
      );
      expect(events).toEqual([
        {
          kind: 'status',
          providerMessageId: 'wamid.9',
          status: mapped,
          at: new Date(1756634400 * 1000),
          callbackData: 'd1',
        },
      ]);
    });

    it('a failed status carries our reason, and 131049 is the marketing cap', () => {
      const [generic] = adapter.parseWebhook(
        hook({
          statuses: [
            {
              id: 'wamid.9',
              status: 'failed',
              timestamp: '1756634400',
              errors: [{ code: 131026, title: 'Undeliverable', error_data: { details: 'not a WhatsApp user' } }],
            },
          ],
        }),
      );
      expect(generic).toMatchObject({ kind: 'status', status: 'FAILED', failureReason: 'PROVIDER_ERROR' });
      for (const code of [131049, '131049']) {
        const [capped] = adapter.parseWebhook(
          hook({ statuses: [{ id: 'wamid.9', status: 'failed', timestamp: '1', errors: [{ code }] }] }),
        );
        expect(capped).toMatchObject({ status: 'FAILED', failureReason: 'MARKETING_CAP' });
      }
    });

    it('yields every status and message across entries, in document order', () => {
      const events = adapter.parseWebhook({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    { id: 'wamid.1', status: 'sent', timestamp: '1' },
                    { id: 'wamid.2', status: 'delivered', timestamp: '2' },
                  ],
                  messages: [
                    { from: '919876543210', id: 'wamid.in', timestamp: '3', type: 'text', text: { body: 'STOP' } },
                  ],
                },
              },
            ],
          },
          {
            changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.3', status: 'read', timestamp: '4' }] } }],
          },
        ],
      });
      expect(events.map((e) => (e.kind === 'status' ? e.providerMessageId : e.text))).toEqual([
        'wamid.1',
        'wamid.2',
        'STOP',
        'wamid.3',
      ]);
    });

    it('an inbound reply arrives with the sender in E.164, whether typed, a quick-reply button, or an interactive button', () => {
      const typed = adapter.parseWebhook(
        hook({ messages: [{ from: '919876543210', type: 'text', text: { body: 'stop please' } }] }),
      );
      const quick = adapter.parseWebhook(
        hook({ messages: [{ from: '919876543210', type: 'button', button: { text: 'STOP', payload: 'STOP' } }] }),
      );
      const interactive = adapter.parseWebhook(
        hook({
          messages: [
            {
              from: '919876543210',
              type: 'interactive',
              interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'Stop' } },
            },
          ],
        }),
      );
      expect(typed).toEqual([{ kind: 'inbound', from: '+919876543210', text: 'stop please' }]);
      expect(quick).toEqual([{ kind: 'inbound', from: '+919876543210', text: 'STOP' }]);
      expect(interactive).toEqual([{ kind: 'inbound', from: '+919876543210', text: 'Stop' }]);
    });

    it('a missing or unparseable timestamp falls back to now', () => {
      const before = Date.now();
      const [a] = adapter.parseWebhook(hook({ statuses: [{ id: 'wamid.9', status: 'sent' }] }));
      const [b] = adapter.parseWebhook(hook({ statuses: [{ id: 'wamid.9', status: 'sent', timestamp: 'soon' }] }));
      expect((a as any).at.getTime()).toBeGreaterThanOrEqual(before);
      expect((b as any).at.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('yields nothing for anything it does not understand', () => {
      expect(adapter.parseWebhook(null)).toEqual([]);
      expect(adapter.parseWebhook('str')).toEqual([]);
      expect(adapter.parseWebhook({ object: 'page', entry: [] })).toEqual([]);
      // Another subscribed field, even one that happens to carry a statuses-shaped value, is not a delivery.
      expect(
        adapter.parseWebhook({
          object: 'whatsapp_business_account',
          entry: [{ changes: [{ field: 'account_review_update', value: { decision: 'APPROVED' } }] }],
        }),
      ).toEqual([]);
      expect(
        adapter.parseWebhook({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                { field: 'account_update', value: { statuses: [{ id: 'w', status: 'sent', timestamp: '1' }] } },
              ],
            },
          ],
        }),
      ).toEqual([]);
      expect(adapter.parseWebhook(hook({}))).toEqual([]);
      expect(adapter.parseWebhook(hook({ statuses: [{ status: 'sent' }] }))).toEqual([]);
      expect(adapter.parseWebhook(hook({ statuses: [{ id: 'w', status: 'warmed' }] }))).toEqual([]);
      expect(adapter.parseWebhook(hook({ messages: [{ from: '91', type: 'image', image: { id: 'i' } }] }))).toEqual([]);
      expect(adapter.parseWebhook(hook({ messages: [{ type: 'text', text: { body: 'no sender' } }] }))).toEqual([]);
    });
  });
});
