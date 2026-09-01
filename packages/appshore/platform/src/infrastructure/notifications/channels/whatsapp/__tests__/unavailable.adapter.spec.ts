import { UnavailableWhatsAppAdapter } from '../unavailable.adapter';
import { WhatsAppSendError } from '../whatsapp.port';

describe('UnavailableWhatsAppAdapter', () => {
  const adapter = new UnavailableWhatsAppAdapter();

  it('is not configured, and says so without throwing into a delivery', () => {
    expect(adapter.isConfigured).toBe(false);
    expect(adapter.providerName).toBe('not configured');
  });

  it('refuses to send with a non-retryable error — retrying "no credentials" is pointless', async () => {
    await expect(
      adapter.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en', bodyValues: [] }),
    ).rejects.toEqual(expect.objectContaining({ retryable: false }));
    await expect(
      adapter.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en', bodyValues: [] }),
    ).rejects.toBeInstanceOf(WhatsAppSendError);
  });

  it('trusts no signature and understands no webhook', () => {
    expect(adapter.verifySignature(Buffer.from('{}'), 'sha256=abc')).toBe(false);
    expect(adapter.parseWebhook({ type: 'message_api_sent' })).toEqual([]);
  });
});
