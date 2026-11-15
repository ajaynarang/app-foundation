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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { VoiceService } from './voice.service';
import { VoiceTokenDto } from './dto/voice-token.dto';
import { VoiceRespondDto } from './dto/voice-respond.dto';
import { VoiceUsageDto } from './dto/voice-usage.dto';
import { VoiceUsageService } from './voice-usage.service';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { VoiceStatusResponse, VoiceTokenResponse } from '../openapi.responses';

@ApiTags('Voice')
@ApiBearerAuth()
@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);

  constructor(
    private readonly voiceService: VoiceService,
    private readonly voiceUsage: VoiceUsageService,
  ) {}

  /** Check if voice mode is available (all vendor keys configured). */
  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Whether voice mode is available (every vendor key configured)' })
  @ApiResult(VoiceStatusResponse)
  async getStatus() {
    const status = await this.voiceService.getStatus();
    // Only expose availability flag — don't leak missing env var names
    return { available: status.available };
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Issue a LiveKit room token for a conversation you own — 503 when voice mode is unavailable',
  })
  @ApiResult(VoiceTokenResponse)
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
   * Called by the forked LiveKit agent to get the assistant's response for a
   * user transcript. Streams NDJSON lines — same data as chat SSE.
   *
   * Auth: shared secret via X-Voice-Agent-Secret header (not Firebase JWT).
   * This endpoint is only called from localhost by the forked agent process.
   */
  @Post('internal/respond')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Internal: stream the assistant reply for a voice transcript as NDJSON (voice agent only, X-Voice-Agent-Secret)',
  })
  async internalRespond(@Req() req: Request, @Res() res: Response, @Body() dto: VoiceRespondDto) {
    this.assertAgentSecret(req);

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

  /**
   * Internal endpoint the forked voice agent calls once when a session ends, with that session's speech-to-text,
   * text-to-speech and session-time totals. They become VOICE rows in the AI cost ledger, priced per unit. Same
   * shared-secret auth as `internal/respond`, and the conversation must be the body's user's in the body's tenant.
   * A retried report with the same `sessionId` records nothing new.
   */
  @Post('internal/usage')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Internal: record a finished voice session’s speech usage in the AI cost ledger (voice agent only, X-Voice-Agent-Secret)',
  })
  @ApiNoContentResponse({ description: 'Recorded' })
  async internalUsage(@Req() req: Request, @Body() dto: VoiceUsageDto): Promise<void> {
    this.assertAgentSecret(req);
    const { userDbId } = await this.voiceService.assertConversationOwner(dto.conversationId, dto.userId, dto.tenantId);
    await this.voiceUsage.recordSessionUsage(dto, userDbId);
  }

  /** Constant-time check of the shared secret the forked agent sends. */
  private assertAgentSecret(req: Request): void {
    const secret = req.headers['x-voice-agent-secret'];
    const expectedSecret = process.env.VOICE_AGENT_SECRET;
    if (!expectedSecret || typeof secret !== 'string' || !secret) {
      throw new ForbiddenException('Invalid voice agent secret');
    }
    const a = Buffer.from(secret, 'utf8');
    const b = Buffer.from(expectedSecret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid voice agent secret');
    }
  }
}
