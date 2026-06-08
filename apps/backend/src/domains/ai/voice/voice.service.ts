import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { AccessToken, AgentDispatchClient, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private sallyAiService: any = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Lazily resolve SallyAiService via ModuleRef to avoid circular dependency.
   * VoiceModule is registered inside AiModule alongside SallyAiModule,
   * so SallyAiService is available in the injection scope.
   */
  private async getSallyAiService() {
    if (!this.sallyAiService) {
      const { SallyAiService } = await import('../assistant/assistant.service' as string);
      this.sallyAiService = this.moduleRef.get(SallyAiService, {
        strict: false,
      });
    }
    return this.sallyAiService;
  }

  /** Check if voice mode is available (feature flag + all vendor keys configured). */
  async getStatus(): Promise<{ available: boolean; missing: string[] }> {
    // Check feature flag first
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: 'voice_mode' },
      select: { enabled: true },
    });
    if (!flag?.enabled) {
      return { available: false, missing: ['feature_flag_disabled'] };
    }

    const required = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'DEEPGRAM_API_KEY', 'CARTESIA_API_KEY'];
    const missing = required.filter((key) => !this.config.get<string>(key));
    return { available: missing.length === 0, missing };
  }

  async generateToken(
    conversationId: string,
    userId: string,
    tenantId: number,
  ): Promise<{ token: string; url: string }> {
    // Validate conversation ownership before issuing a room token
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    if (conversation.userId !== user.id || conversation.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

    // Fetch user's voice preferences
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId: user.id },
      select: { voiceMode: true, voiceId: true, voiceSpeed: true },
    });
    const voicePrefs = {
      voiceMode: prefs?.voiceMode ?? 'manual',
      voiceId: prefs?.voiceId ?? 'warm',
      voiceSpeed: prefs?.voiceSpeed ?? 'normal',
    };

    const apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
    const url = this.config.getOrThrow<string>('LIVEKIT_URL');

    const roomName = `voice-${conversationId}`;
    const identity = JSON.stringify({
      userId,
      tenantId,
      conversationId,
      voicePrefs,
    });

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: '10m',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });

    // Dispatch the sally-voice agent to this room when participant joins
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: 'sally-voice' })],
    });

    const jwt = await token.toJwt();

    // Explicitly dispatch the agent to this room (belt-and-suspenders
    // alongside the token roomConfig — some LiveKit Cloud tiers require
    // explicit dispatch via API rather than token-based dispatch)
    try {
      const dispatchClient = new AgentDispatchClient(url, apiKey, apiSecret);
      await dispatchClient.createDispatch(roomName, 'sally-voice', {
        metadata: identity,
      });
      this.logger.log(`Dispatched sally-voice agent to room=${roomName}`);
    } catch (dispatchError) {
      this.logger.warn(
        `Agent dispatch failed for room=${roomName} — agent may join via token roomConfig instead`,
        dispatchError,
      );
    }

    this.logger.log(`Generated voice token for user=${userId} room=${roomName}`);

    return { token: jwt, url };
  }

  /**
   * Stream Sally's response for a voice transcript.
   *
   * Delegates to SallyAiService.generateResponse() — the exact same
   * pipeline used by text chat (moderation, Mastra agent, MCP tools, audit).
   * Voice is just a different input/output layer.
   */
  async *generateVoiceResponse(
    conversationId: string,
    text: string,
    userId: string,
    tenantId: number,
  ): AsyncGenerator<{
    type: 'text-delta' | 'card' | 'suspend' | 'blocked' | 'complete';
    data: string;
  }> {
    const sallyAi = await this.getSallyAiService();
    yield* sallyAi.generateResponse(conversationId, text, 'voice', userId, tenantId);
  }
}
