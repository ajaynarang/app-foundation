import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  Req,
  Logger,
  HttpCode,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional } from 'class-validator';
import * as crypto from 'crypto';
import { Public } from '../../../../auth/decorators/public.decorator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TenderService } from '../tender/tender.service';
import { EDIPartnerService } from '../services/edi-partner.service';

class EDIWebhookDto {
  @IsString()
  transactionType: string;

  @IsString()
  senderIsaId: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsString()
  @IsOptional()
  signature?: string;
}

/**
 * EDIWebhookController
 *
 * Receives inbound EDI messages from VAN providers (e.g. SPS Commerce).
 * Uses @Public() to skip JWT auth — webhook callers are external systems.
 * HMAC signature validation ensures authenticity.
 *
 * Route: POST /edi/webhooks/:tenantId
 */
@ApiTags('EDI')
@Controller('edi/webhooks')
export class EDIWebhookController {
  private readonly logger = new Logger(EDIWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenderService: TenderService,
    private readonly partnerService: EDIPartnerService,
  ) {}

  @Post(':tenantId')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Receive inbound EDI message from VAN provider' })
  async handleInbound(
    @Param('tenantId') tenantIdParam: string,
    @Headers('x-edi-signature') signatureHeader: string,
    @Req() req: any,
    @Body() body: EDIWebhookDto,
  ) {
    // Validate HMAC signature
    const webhookSecret = this.config.get<string>('EDI_WEBHOOK_SECRET', '');
    if (!webhookSecret) {
      this.logger.error('EDI_WEBHOOK_SECRET is not configured — rejecting webhook');
      throw new UnauthorizedException('Webhook endpoint not configured');
    }

    const rawBody = req.rawBody as Buffer;
    const payloadStr = rawBody ? rawBody.toString('utf8') : JSON.stringify(body);

    if (!signatureHeader) {
      this.logger.warn('EDI webhook received without x-edi-signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedSignature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(payloadStr).digest('hex')}`;

    const sigBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn('Invalid EDI webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Resolve tenantId — prefer path param, fall back to ISA ID lookup
    let tenantId: number;
    if (tenantIdParam && !isNaN(Number(tenantIdParam))) {
      tenantId = Number(tenantIdParam);
    } else {
      // Attempt to resolve tenant from sender ISA ID
      this.logger.warn(`Invalid tenantId param "${tenantIdParam}", attempting ISA lookup`);
      throw new NotFoundException('Could not resolve tenant from webhook path');
    }

    this.logger.log(`Received EDI ${body.transactionType} from ${body.senderIsaId} for tenant ${tenantId}`);

    if (body.transactionType === '204') {
      const result = await this.tenderService.processInboundTender(tenantId, body.senderIsaId, body.payload);
      return {
        success: true,
        loadId: result.load.id,
        autoAccepted: result.autoAccepted,
      };
    }

    this.logger.warn(`Unsupported EDI transaction type: ${body.transactionType}`);
    throw new BadRequestException(`Unsupported EDI transaction type: ${body.transactionType}`);
  }
}
