import { Injectable, Logger } from '@nestjs/common';
import { AiInvocationStatus, AiSurface, AiUsageUnit } from '@appshore/db';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AI_LINK_REF_TYPES } from '../infrastructure/telemetry/ai-telemetry.constants';
import type { VoiceUsageDto } from './dto/voice-usage.dto';

/** Vendor labels for the voice rows of the cost ledger; each must match a `model_pricing.provider`. */
export const VOICE_PROVIDERS = {
  STT: 'deepgram',
  TTS: 'cartesia',
  SESSION: 'livekit',
} as const;

/** LiveKit bills agent-session minutes, not a model; this is its `model_pricing.model` key. */
export const LIVEKIT_SESSION_MODEL = 'agent-session';

/** The LiveKit agent name the voice worker registers (`voice.service.ts` dispatches it). */
const VOICE_AGENT_ID = 'app-voice';
const MS_PER_SECOND = 1000;

interface VoiceMeter {
  provider: string;
  model: string;
  unit: AiUsageUnit;
  quantity: number;
}

/**
 * Records the speech half of a voice session (speech-to-text audio, text-to-speech characters and the LiveKit agent
 * session) in the same `ai_invocations` ledger as tokens, one row per meter, priced per unit. The language turns are
 * already recorded as CHAT by the chat pipeline voice delegates to.
 *
 * The rows carry no route and no credential type: the voice vendors run on platform keys, so the platform pays, and
 * the rows count toward the workspace's AI cap like any other platform-paid row.
 */
@Injectable()
export class VoiceUsageService {
  private readonly logger = new Logger(VoiceUsageService.name);

  constructor(private readonly aiTelemetry: AiTelemetryService) {}

  /** `userDbId` is the conversation owner's database id, from the ownership check the caller has already made. */
  async recordSessionUsage(usage: VoiceUsageDto, userDbId: number): Promise<void> {
    const meters: VoiceMeter[] = [
      {
        provider: VOICE_PROVIDERS.STT,
        model: usage.sttModel,
        unit: AiUsageUnit.AUDIO_SECOND,
        quantity: toBilledSeconds(usage.sttAudioMs),
      },
      {
        provider: VOICE_PROVIDERS.TTS,
        model: usage.ttsModel,
        unit: AiUsageUnit.CHARACTER,
        quantity: usage.ttsCharacters,
      },
      {
        provider: VOICE_PROVIDERS.SESSION,
        model: LIVEKIT_SESSION_MODEL,
        unit: AiUsageUnit.SESSION_SECOND,
        quantity: toBilledSeconds(usage.sessionMs),
      },
    ];

    for (const meter of meters.filter((m) => m.quantity > 0)) {
      await this.aiTelemetry.record(
        {
          provider: meter.provider,
          model: meter.model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          usageUnit: meter.unit,
          usageQuantity: meter.quantity,
          status: AiInvocationStatus.OK,
        },
        {
          tenantId: usage.tenantId,
          userId: userDbId,
          surface: AiSurface.VOICE,
          agentId: VOICE_AGENT_ID,
          linkRefType: AI_LINK_REF_TYPES.CONVERSATION,
          linkRefId: usage.conversationId,
          idempotencyKey: `voice:${usage.sessionId}:${meter.unit}`,
        },
      );
    }

    this.logger.log(
      `Voice usage recorded: session=${usage.sessionId} stt=${usage.sttAudioMs}ms tts=${usage.ttsCharacters}ch session=${usage.sessionMs}ms`,
    );
  }
}

/** Vendors bill whole seconds; a partial second is billed as one. */
function toBilledSeconds(ms: number): number {
  return Math.ceil(ms / MS_PER_SECOND);
}
