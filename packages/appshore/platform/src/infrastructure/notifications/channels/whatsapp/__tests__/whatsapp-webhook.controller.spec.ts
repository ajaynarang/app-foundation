import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DeliveryLedgerService } from '../../../pipeline/delivery-ledger.service';
import { WhatsAppWebhookController } from '../whatsapp-webhook.controller';
import { WHATSAPP_PORT } from '../whatsapp.port';
import { WhatsAppConsentService } from '../whatsapp-consent.service';

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  const whatsapp = {
    signatureHeader: 'x-hub-signature-256',
    verifySignature: jest.fn(),
    parseWebhook: jest.fn(),
    verifyChallenge: jest.fn(),
  };
  const ledger = { applyProviderStatus: jest.fn().mockResolvedValue(true) };
  const consent = { optOutByPhone: jest.fn().mockResolvedValue(true) };
  const at = new Date('2026-08-31T10:00:00Z');
  const req = (body: unknown, signature?: string | string[]) =>
    ({
      rawBody: Buffer.from(JSON.stringify(body)),
      body,
      headers: signature === undefined ? {} : { 'x-hub-signature-256': signature },
    }) as unknown as Request;
  const res = () => ({ type: jest.fn() }) as unknown as Response;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        { provide: WHATSAPP_PORT, useValue: whatsapp },
        { provide: DeliveryLedgerService, useValue: ledger },
        { provide: WhatsAppConsentService, useValue: consent },
      ],
    }).compile();
    controller = module.get(WhatsAppWebhookController);
    jest.clearAllMocks();
    whatsapp.verifySignature.mockReturnValue(true);
    whatsapp.parseWebhook.mockReturnValue([]);
    ledger.applyProviderStatus.mockResolvedValue(true);
  });

  describe('the subscription handshake', () => {
    it('echoes the challenge as plain text when the provider accepts the token', () => {
      whatsapp.verifyChallenge.mockReturnValue('12345');
      const r = res();
      expect(controller.verify({ 'hub.mode': 'subscribe', 'hub.verify_token': 't', 'hub.challenge': '12345' }, r)).toBe(
        '12345',
      );
      expect(r.type).toHaveBeenCalledWith('text/plain');
    });

    it('403s when the provider refuses, or has no handshake at all', () => {
      whatsapp.verifyChallenge.mockReturnValue(null);
      expect(() => controller.verify({ 'hub.mode': 'subscribe' }, res())).toThrow(ForbiddenException);
      const { verifyChallenge, ...noHandshake } = whatsapp;
      void verifyChallenge;
      const bare = new WhatsAppWebhookController(noHandshake as any, ledger as any, consent as any);
      expect(() => bare.verify({}, res())).toThrow(ForbiddenException);
    });
  });

  it('401s a bad or missing signature and touches nothing', async () => {
    whatsapp.verifySignature.mockReturnValue(false);
    await expect(controller.receive(req({ object: 'x' }, 'sha256=bad'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.receive(req({ object: 'x' }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(whatsapp.parseWebhook).not.toHaveBeenCalled();
    expect(ledger.applyProviderStatus).not.toHaveBeenCalled();
  });

  it("reads the signature from the PROVIDER's header and verifies against the RAW body", async () => {
    const r = req({ a: 1 }, 'sha256=x');
    await controller.receive(r);
    expect(whatsapp.verifySignature).toHaveBeenCalledWith((r as any).rawBody, 'sha256=x');
    await controller.receive(req({ a: 1 }, ['sha256=first', 'sha256=second']));
    expect(whatsapp.verifySignature).toHaveBeenLastCalledWith(expect.any(Buffer), 'sha256=first');
  });

  it('applies a status event to the ledger and returns 200', async () => {
    whatsapp.parseWebhook.mockReturnValue([{ kind: 'status', providerMessageId: 'im_1', status: 'DELIVERED', at }]);

    await expect(controller.receive(req({}, 'sha256=ok'))).resolves.toEqual({ received: true });

    expect(ledger.applyProviderStatus).toHaveBeenCalledWith({
      providerMessageId: 'im_1',
      status: 'DELIVERED',
      at,
      failureReason: undefined,
      callbackData: undefined,
    });
  });

  it('applies every event of a batched webhook, in order', async () => {
    whatsapp.parseWebhook.mockReturnValue([
      { kind: 'status', providerMessageId: 'im_1', status: 'SENT', at },
      { kind: 'inbound', from: '+919876543210', text: 'STOP' },
      { kind: 'status', providerMessageId: 'im_2', status: 'READ', at },
    ]);
    await expect(controller.receive(req({}, 'sha256=ok'))).resolves.toEqual({ received: true });
    expect(ledger.applyProviderStatus.mock.calls.map((c) => c[0].providerMessageId)).toEqual(['im_1', 'im_2']);
    expect(consent.optOutByPhone).toHaveBeenCalledWith('+919876543210');
  });

  it('a status for an unknown message is still a 200 — the vendor must not retry', async () => {
    whatsapp.parseWebhook.mockReturnValue([{ kind: 'status', providerMessageId: 'nope', status: 'READ', at }]);
    ledger.applyProviderStatus.mockResolvedValue(false);
    await expect(controller.receive(req({}, 'sha256=ok'))).resolves.toEqual({ received: true });
  });

  it.each(['STOP', ' stop ', 'Unsubscribe', 'STOP.', 'stop please', 'Stop sending these'])(
    'an inbound %j opts that number out',
    async (text) => {
      whatsapp.parseWebhook.mockReturnValue([{ kind: 'inbound', from: '+919876543210', text }]);
      await expect(controller.receive(req({}, 'sha256=ok'))).resolves.toEqual({ received: true });
      expect(consent.optOutByPhone).toHaveBeenCalledWith('+919876543210');
      expect(ledger.applyProviderStatus).not.toHaveBeenCalled();
    },
  );

  it('any other inbound text is acknowledged and not read', async () => {
    whatsapp.parseWebhook.mockReturnValue([
      { kind: 'inbound', from: '+919876543210', text: 'Is class on today? please stop the rain' },
    ]);
    await expect(controller.receive(req({}, 'sha256=ok'))).resolves.toEqual({ received: true });
    expect(consent.optOutByPhone).not.toHaveBeenCalled();
  });

  it('a webhook with nothing we understand is a 200', async () => {
    await expect(controller.receive(req({ object: 'x' }, 'sha256=ok'))).resolves.toEqual({ received: true });
  });

  it('passes the echoed callback data through so a lost send can still be settled', async () => {
    whatsapp.parseWebhook.mockReturnValue([
      { kind: 'status', providerMessageId: 'im_1', status: 'SENT', at, callbackData: 'd1' },
    ]);
    await controller.receive(req({}, 'sha256=ok'));
    expect(ledger.applyProviderStatus).toHaveBeenCalledWith(expect.objectContaining({ callbackData: 'd1' }));
  });
});
