import type { ConfigService } from '@nestjs/config';
import { InteraktWhatsAppAdapter } from '../interakt.adapter';
import { MetaCloudWhatsAppAdapter } from '../meta-cloud.adapter';
import { UnavailableWhatsAppAdapter } from '../unavailable.adapter';
import { createWhatsAppPort } from '../whatsapp-port.factory';

describe('createWhatsAppPort', () => {
  const config = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;
  const logger = { warn: jest.fn() } as any;
  const keys = { WHATSAPP_API_KEY: 'k', WHATSAPP_WEBHOOK_SECRET: 's' };

  beforeEach(() => jest.clearAllMocks());

  it('is Meta by default when the keys and the phone-number id are present', () => {
    const port = createWhatsAppPort(config({ ...keys, WHATSAPP_PHONE_NUMBER_ID: '123' }), logger);
    expect(port).toBeInstanceOf(MetaCloudWhatsAppAdapter);
    expect(port.providerName).toBe('Meta Cloud API');
    expect(port.signatureHeader).toBe('x-hub-signature-256');
  });

  it('hands Meta a base-URL override for an emulator', () => {
    const port = createWhatsAppPort(
      config({ ...keys, WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_GRAPH_API_BASE_URL: 'http://localhost:4004/v25.0' }),
      logger,
    );
    expect((port as any).config.baseUrl).toBe('http://localhost:4004/v25.0');
  });

  it('is Interakt when asked, whatever the case of the value', () => {
    for (const value of ['interakt', 'Interakt']) {
      const port = createWhatsAppPort(config({ ...keys, WHATSAPP_PROVIDER: value }), logger);
      expect(port).toBeInstanceOf(InteraktWhatsAppAdapter);
      expect(port.signatureHeader).toBe('interakt-signature');
    }
  });

  it.each([
    ['no keys at all', {}],
    ['only the api key', { WHATSAPP_API_KEY: 'k' }],
    ['only the secret', { WHATSAPP_WEBHOOK_SECRET: 's' }],
  ])('is unavailable with %s — a delivery becomes NOT_CONFIGURED, never a throw', (_label, env) => {
    const port = createWhatsAppPort(config(env), logger);
    expect(port).toBeInstanceOf(UnavailableWhatsAppAdapter);
    expect(port.isConfigured).toBe(false);
  });

  it('a Meta setup without the phone-number id stays off and says so once', () => {
    const port = createWhatsAppPort(config(keys), logger);
    expect(port).toBeInstanceOf(UnavailableWhatsAppAdapter);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_PHONE_NUMBER_ID'));
  });

  it('an unknown provider name stays off rather than guessing', () => {
    const port = createWhatsAppPort(config({ ...keys, WHATSAPP_PROVIDER: 'twilio' }), logger);
    expect(port).toBeInstanceOf(UnavailableWhatsAppAdapter);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('twilio'));
  });
});
