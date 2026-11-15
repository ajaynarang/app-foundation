import { VoiceUsageService } from '../voice-usage.service';

describe('VoiceUsageService', () => {
  const usage = {
    sessionId: '0f8c2a52-2d0f-4c6b-9b8e-6b5f8c7d2e11',
    conversationId: 'conv_1',
    userId: 'user_1',
    tenantId: 7,
    sttModel: 'nova-3',
    ttsModel: 'sonic-3',
    sttAudioMs: 61_200,
    ttsCharacters: 900,
    sessionMs: 75_000,
  };
  const USER_DB_ID = 11;
  let aiTelemetry: { record: jest.Mock };
  let service: VoiceUsageService;

  beforeEach(() => {
    aiTelemetry = { record: jest.fn().mockResolvedValue({}) };
    service = new VoiceUsageService(aiTelemetry as any);
  });

  it('records one ledger row per meter, rounding milliseconds up to billed seconds', async () => {
    await service.recordSessionUsage(usage, USER_DB_ID);

    const rows = aiTelemetry.record.mock.calls.map(([u]) => ({
      provider: u.provider,
      model: u.model,
      unit: u.usageUnit,
      quantity: u.usageQuantity,
      tokens: u.totalTokens,
    }));
    expect(rows).toEqual([
      { provider: 'deepgram', model: 'nova-3', unit: 'AUDIO_SECOND', quantity: 62, tokens: 0 },
      { provider: 'cartesia', model: 'sonic-3', unit: 'CHARACTER', quantity: 900, tokens: 0 },
      { provider: 'livekit', model: 'agent-session', unit: 'SESSION_SECOND', quantity: 75, tokens: 0 },
    ]);
  });

  it('tags every row with the VOICE surface, tenant, user, conversation and a per-meter idempotency key', async () => {
    await service.recordSessionUsage(usage, USER_DB_ID);

    const contexts = aiTelemetry.record.mock.calls.map(([, ctx]) => ctx);
    for (const ctx of contexts) {
      expect(ctx).toMatchObject({
        tenantId: 7,
        userId: USER_DB_ID,
        surface: 'VOICE',
        agentId: 'app-voice',
        linkRefType: 'conversation',
        linkRefId: 'conv_1',
      });
    }
    expect(contexts.map((c) => c.idempotencyKey)).toEqual([
      `voice:${usage.sessionId}:AUDIO_SECOND`,
      `voice:${usage.sessionId}:CHARACTER`,
      `voice:${usage.sessionId}:SESSION_SECOND`,
    ]);
  });

  it('writes platform-paid rows: no route and no credential type, so the platform cap counts them', async () => {
    await service.recordSessionUsage(usage, USER_DB_ID);

    for (const [u] of aiTelemetry.record.mock.calls) {
      expect(u.routeId).toBeUndefined();
      expect(u.credentialType).toBeUndefined();
    }
  });

  it('skips meters with nothing to bill', async () => {
    await service.recordSessionUsage({ ...usage, sttAudioMs: 0, ttsCharacters: 0 }, USER_DB_ID);

    expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
    expect(aiTelemetry.record.mock.calls[0][0].usageUnit).toBe('SESSION_SECOND');
  });
});
