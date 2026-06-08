import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  ServiceUnavailableException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { Public } from '../../../auth/decorators/public.decorator';
import { VoiceService } from './voice.service';
import { VoiceTokenDto } from './dto/voice-token.dto';
import { VoiceRespondDto } from './dto/voice-respond.dto';
import type { Request, Response } from 'express';

@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);

  constructor(private readonly voiceService: VoiceService) {}

  /** Check if voice mode is available (all vendor keys configured). */
  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.SUPER_ADMIN)
  async getStatus() {
    const status = await this.voiceService.getStatus();
    // Only expose availability flag — don't leak missing env var names
    return { available: status.available };
  }

  @Post('token')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async getToken(@CurrentUser() user: any, @Body() dto: VoiceTokenDto) {
    const status = await this.voiceService.getStatus();
    if (!status.available) {
      throw new ServiceUnavailableException(`Voice mode not available`);
    }
    return this.voiceService.generateToken(dto.conversationId, user.userId, user.tenantDbId);
  }

  /**
   * Internal streaming endpoint for the voice agent process.
   *
   * Called by the forked LiveKit agent to get Sally's response for a
   * user transcript. Streams NDJSON lines — same data as chat SSE.
   *
   * Auth: shared secret via X-Voice-Agent-Secret header (not Firebase JWT).
   * This endpoint is only called from localhost by the forked agent process.
   */
  @Post('internal/respond')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async internalRespond(@Req() req: Request, @Res() res: Response, @Body() dto: VoiceRespondDto) {
    // Validate shared secret — constant-time comparison to prevent timing attacks
    const secret = req.headers['x-voice-agent-secret'] as string;
    const expectedSecret = process.env.VOICE_AGENT_SECRET;
    if (!expectedSecret || !secret) {
      throw new ForbiddenException('Invalid voice agent secret');
    }
    try {
      const a = Buffer.from(secret, 'utf8');
      const b = Buffer.from(expectedSecret, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new ForbiddenException('Invalid voice agent secret');
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new ForbiddenException('Invalid voice agent secret');
    }

    this.logger.log(`Voice respond — conversation=${dto.conversationId} user=${dto.userId}`);

    // Stream NDJSON response
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const generator = this.voiceService.generateVoiceResponse(dto.conversationId, dto.text, dto.userId, dto.tenantId);

      for await (const chunk of generator) {
        res.write(JSON.stringify(chunk) + '\n');
      }
    } catch (error) {
      this.logger.error('Voice respond error', error);
      res.write(
        JSON.stringify({
          type: 'text-delta',
          data: 'Sorry, something went wrong. Please try again.',
        }) + '\n',
      );
    }

    res.end();
  }
}
