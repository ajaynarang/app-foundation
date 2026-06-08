import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EDIWebhookController } from '../edi-webhook.controller';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { TenderService } from '../../tender/tender.service';
import { EDIPartnerService } from '../../services/edi-partner.service';

describe('EDIWebhookController', () => {
  let controller: EDIWebhookController;
  let configService: { get: jest.Mock };
  let tenderService: { processInboundTender: jest.Mock };
  let partnerService: { findByIsaId: jest.Mock };

  const webhookSecret = 'test-webhook-secret';

  function makeSignature(body: string): string {
    return `sha256=${crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
  }

  beforeEach(async () => {
    configService = { get: jest.fn() };
    tenderService = { processInboundTender: jest.fn() };
    partnerService = { findByIsaId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EDIWebhookController],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: configService },
        { provide: TenderService, useValue: tenderService },
        { provide: EDIPartnerService, useValue: partnerService },
      ],
    }).compile();

    controller = module.get<EDIWebhookController>(EDIWebhookController);
  });

  const baseBody = {
    transactionType: '204',
    senderIsaId: 'ISA-001',
    payload: { shipmentId: 'SHIP-1' },
  };

  function makeReq(bodyObj: any): any {
    const bodyStr = JSON.stringify(bodyObj);
    return {
      rawBody: Buffer.from(bodyStr, 'utf8'),
    };
  }

  describe('handleInbound', () => {
    it('should throw UnauthorizedException when webhook secret is not configured', async () => {
      configService.get.mockReturnValue('');

      await expect(controller.handleInbound('1', 'some-sig', makeReq(baseBody), baseBody)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when signature header is missing', async () => {
      configService.get.mockReturnValue(webhookSecret);

      await expect(controller.handleInbound('1', undefined as any, makeReq(baseBody), baseBody)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when signature is invalid', async () => {
      configService.get.mockReturnValue(webhookSecret);

      await expect(controller.handleInbound('1', 'sha256=invalid', makeReq(baseBody), baseBody)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw NotFoundException when tenantId param is not a number', async () => {
      configService.get.mockReturnValue(webhookSecret);
      const bodyStr = JSON.stringify(baseBody);
      const sig = makeSignature(bodyStr);

      await expect(controller.handleInbound('invalid', sig, makeReq(baseBody), baseBody)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should process 204 tender and return success', async () => {
      configService.get.mockReturnValue(webhookSecret);
      const bodyStr = JSON.stringify(baseBody);
      const sig = makeSignature(bodyStr);

      tenderService.processInboundTender.mockResolvedValue({
        load: { id: 42 },
        autoAccepted: false,
      });

      const result = await controller.handleInbound('1', sig, makeReq(baseBody), baseBody);

      expect(result).toEqual({
        success: true,
        loadId: 42,
        autoAccepted: false,
      });
      expect(tenderService.processInboundTender).toHaveBeenCalledWith(1, 'ISA-001', baseBody.payload);
    });

    it('should return autoAccepted=true when tender is auto-accepted', async () => {
      configService.get.mockReturnValue(webhookSecret);
      const bodyStr = JSON.stringify(baseBody);
      const sig = makeSignature(bodyStr);

      tenderService.processInboundTender.mockResolvedValue({
        load: { id: 99 },
        autoAccepted: true,
      });

      const result = await controller.handleInbound('5', sig, makeReq(baseBody), baseBody);

      expect(result.autoAccepted).toBe(true);
      expect(result.loadId).toBe(99);
    });

    it('should throw BadRequestException for unsupported transaction type', async () => {
      configService.get.mockReturnValue(webhookSecret);
      const body = { ...baseBody, transactionType: '999' };
      const bodyStr = JSON.stringify(body);
      const sig = makeSignature(bodyStr);

      await expect(controller.handleInbound('1', sig, makeReq(body), body)).rejects.toThrow(BadRequestException);
    });

    it('should use JSON.stringify(body) when rawBody is not available', async () => {
      configService.get.mockReturnValue(webhookSecret);
      const bodyStr = JSON.stringify(baseBody);
      const sig = makeSignature(bodyStr);

      tenderService.processInboundTender.mockResolvedValue({
        load: { id: 1 },
        autoAccepted: false,
      });

      // req without rawBody
      const result = await controller.handleInbound('1', sig, { rawBody: undefined }, baseBody);

      expect(result.success).toBe(true);
    });
  });
});
