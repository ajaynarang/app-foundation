/**
 * Voice Agent Entry Point
 *
 * Forked as a child process by LiveKit AgentServer.
 * Runs the voice pipeline: Deepgram STT → the assistant API → Cartesia TTS.
 *
 * Reads user voice preferences from participant identity metadata:
 *   - voiceMode: 'manual' (review + send) or 'auto' (immediate)
 *   - voiceId: curated voice key → Cartesia UUID
 *   - voiceSpeed: TTS speed parameter
 *
 * Reports the session's speech usage (speech-to-text audio, text-to-speech characters, session time) once, when the
 * session closes or the job shuts down, to the backend's `voice/internal/usage` route for the AI cost ledger.
 *
 * Uses module.exports (not export default) to avoid CJS/ESM double-wrapping.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineAgent, voice: voiceModule, metrics: metricsModule } = require('@livekit/agents');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const silero = require('@livekit/agents-plugin-silero');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dgPlugin = require('@livekit/agents-plugin-deepgram');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cartesiaPlugin = require('@livekit/agents-plugin-cartesia');

const APP_API_URL = process.env.APP_API_URL || 'http://localhost:8001';
const VOICE_AGENT_SECRET = process.env.VOICE_AGENT_SECRET || '';

/**
 * Map voice tone keys to Cartesia voice UUIDs.
 * UUIDs are read from environment variables so they can be changed
 * without a code deploy. Defaults are provided for dev convenience.
 *
 * To find voice UUIDs: https://play.cartesia.ai/
 */
const VOICE_MAP: Record<string, string> = {
  warm: process.env.CARTESIA_VOICE_WARM || '1f15f888-ce6e-4656-9c9f-fd769a11d5bc',
  confident: process.env.CARTESIA_VOICE_CONFIDENT || 'bf7d7fc1-7236-4fce-a36f-3eabed0eb39b',
  calm: process.env.CARTESIA_VOICE_CALM || '1f15f888-ce6e-4656-9c9f-fd769a11d5bc',
};

/**
 * Call the assistant's internal streaming endpoint. Returns a ReadableStream of text.
 */
async function callAssistantApi(
  conversationId: string,
  text: string,
  userId: string,
  tenantId: number,
): Promise<ReadableStream<string>> {
  const url = `${APP_API_URL}/api/v1/voice/internal/respond`;

  // 30-second timeout for the initial connection — voice must be responsive
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Voice-Agent-Secret': VOICE_AGENT_SECRET,
      },
      body: JSON.stringify({ conversationId, text, userId, tenantId }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    console.error(`[VoiceAgent] the assistant API fetch failed: ${err.message}`);
    return new ReadableStream<string>({
      start(ctrl) {
        ctrl.enqueue("Sorry, I'm taking too long to respond. Please try again or use text mode.");
        ctrl.close();
      },
    });
  }
  clearTimeout(timeout);

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => 'unknown error');
    console.error(`[VoiceAgent] the assistant API error: ${response.status} ${errText}`);
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue("Sorry, I couldn't process that. Please try again.");
        controller.close();
      },
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream<string>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              if ((parsed.type === 'text-delta' || parsed.type === 'blocked') && parsed.data) {
                controller.enqueue(parsed.data);
              }
            } catch {
              /* trailing data */
            }
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if ((parsed.type === 'text-delta' || parsed.type === 'blocked') && parsed.data) {
              controller.enqueue(parsed.data);
            }
          } catch {
            /* malformed line */
          }
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

interface SessionUsageReport {
  sessionId: string;
  conversationId: string;
  userId: string;
  tenantId: number;
  sttModel: string;
  ttsModel: string;
  sttAudioMs: number;
  ttsCharacters: number;
  sessionMs: number;
}

/**
 * Report a finished session's speech meters to the cost ledger. Never throws: a lost report means missing cost data,
 * not a broken call.
 */
async function reportSessionUsage(report: SessionUsageReport): Promise<void> {
  try {
    const response = await fetch(`${APP_API_URL}/api/v1/voice/internal/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Voice-Agent-Secret': VOICE_AGENT_SECRET,
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[VoiceAgent] Usage report rejected: ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[VoiceAgent] Usage report failed: ${err.message}`);
  }
}

interface VoicePrefs {
  voiceMode: string;
  voiceId: string;
  voiceSpeed: string;
}

const DEFAULT_PREFS: VoicePrefs = {
  voiceMode: 'manual',
  voiceId: 'warm',
  voiceSpeed: 'normal',
};

module.exports = defineAgent({
  prewarm: async (proc: any) => {
    proc.userData.vad = await silero.VAD.load();
    console.log('[VoiceAgent] Silero VAD model loaded');
  },

  entry: async (ctx: any) => {
    console.log('[VoiceAgent] Connecting to room...');
    try {
      await ctx.connect();
      console.log('[VoiceAgent] Connected to room, waiting for participant...');
    } catch (err) {
      console.error('[VoiceAgent] Failed to connect to room:', err);
      return;
    }

    let participant: any;
    try {
      participant = await ctx.waitForParticipant();
      console.log('[VoiceAgent] Participant joined, identity:', participant.identity);
    } catch (err) {
      console.error('[VoiceAgent] waitForParticipant failed:', err);
      return;
    }

    let authContext: {
      userId: string;
      tenantId: number;
      conversationId: string;
      voicePrefs?: VoicePrefs;
    };

    try {
      authContext = JSON.parse(participant.identity);
    } catch {
      console.error('[VoiceAgent] Invalid participant identity:', participant.identity);
      return;
    }

    const voicePrefs = { ...DEFAULT_PREFS, ...authContext.voicePrefs };

    console.log(
      `[VoiceAgent] User=${authContext.userId} conversation=${authContext.conversationId} ` +
        `mode=${voicePrefs.voiceMode} voice=${voicePrefs.voiceId} speed=${voicePrefs.voiceSpeed}`,
    );

    // ── Deepgram STT — model configurable via env ──
    const sttModel = process.env.DEEPGRAM_STT_MODEL || 'nova-3';
    const stt = new dgPlugin.STT({
      model: sttModel,
      language: process.env.DEEPGRAM_STT_LANGUAGE || 'en-US',
      interimResults: true,
      smartFormat: true,
      punctuate: true,
      endpointing: 400,
      fillerWords: false,
      profanityFilter: false,
      apiKey: process.env.DEEPGRAM_API_KEY,
    });

    // ── Cartesia TTS — model + voice configurable via env ──
    // Speed mapping: user-facing string → numeric multiplier for Cartesia API
    const SPEED_MAP: Record<string, number> = {
      slowest: 0.7,
      slow: 0.85,
      normal: 1.0,
      fast: 1.2,
      fastest: 1.4,
    };

    const ttsModel = process.env.CARTESIA_TTS_MODEL || 'sonic-3';
    const tts = new cartesiaPlugin.TTS({
      model: ttsModel,
      language: process.env.CARTESIA_TTS_LANGUAGE || 'en',
      voice: VOICE_MAP[voicePrefs.voiceId] || VOICE_MAP.warm,
      speed: SPEED_MAP[voicePrefs.voiceSpeed] || 1.0,
      apiKey: process.env.CARTESIA_API_KEY,
    });

    const session = new voiceModule.AgentSession({
      stt,
      tts,
      vad: ctx.proc.userData.vad,
    });

    // ── Helpers ──

    const sendDataEvent = (event: { type: string; text: string }) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify(event));
        ctx.room.localParticipant?.publishData(data, { reliable: true });
      } catch {
        /* data channel not ready */
      }
    };

    let activeAbort: AbortController | null = null;

    /** Shared handler: call the assistant API, stream TTS + UI transcript. */
    async function handleUserMessage(transcript: string) {
      // Cancel any in-progress response
      if (activeAbort) {
        activeAbort.abort();
        session.interrupt();
      }
      activeAbort = new AbortController();
      const signal = activeAbort.signal;

      try {
        const textStream = await callAssistantApi(
          authContext.conversationId,
          transcript,
          authContext.userId,
          authContext.tenantId,
        );

        if (signal.aborted) return;

        const [ttsStream, uiStream] = textStream.tee();
        session.say(ttsStream, { allowInterruptions: true });

        const uiReader = uiStream.getReader();
        let fullResponse = '';
        try {
          while (true) {
            if (signal.aborted) break;
            const { done, value } = await uiReader.read();
            if (done) break;
            fullResponse += value;
            sendDataEvent({ type: 'assistant-transcript', text: value });
          }
          if (!signal.aborted) {
            sendDataEvent({ type: 'assistant-complete', text: fullResponse });
          }
        } catch {
          /* stream closed */
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('[VoiceAgent] Error:', error);
          sendDataEvent({
            type: 'assistant-complete',
            text: 'Sorry, something went wrong. Please try again or use text mode.',
          });
          try {
            session.say('Sorry, something went wrong. Please try again.');
          } catch {
            /* TTS may also fail */
          }
        }
      } finally {
        if (activeAbort?.signal === signal) {
          activeAbort = null;
        }
      }
    }

    // ── STT transcript handler ──

    session.on('user_input_transcribed', async (ev: any) => {
      const transcript = ev.transcript?.trim();
      if (!transcript) return;

      // Interim → live preview in UI only
      if (!ev.isFinal) {
        sendDataEvent({ type: 'user-transcript', text: transcript });
        return;
      }

      // Final transcript
      console.log(`[VoiceAgent] User: "${transcript}"`);
      sendDataEvent({ type: 'user-transcript', text: transcript });

      // Manual mode: wait for explicit "send" from UI
      if (voicePrefs.voiceMode === 'manual') {
        console.log('[VoiceAgent] Manual mode — waiting for send command');
        return;
      }

      // Auto mode: respond immediately
      sendDataEvent({ type: 'processing', text: '' });
      await handleUserMessage(transcript);
    });

    // ── Data channel listener (manual mode "send" command) ──

    ctx.room.on('dataReceived', (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === 'send' && msg.text && voicePrefs.voiceMode === 'manual') {
          console.log(`[VoiceAgent] Manual send: "${msg.text}"`);
          sendDataEvent({ type: 'processing', text: '' });
          handleUserMessage(msg.text).catch((err) => console.error('[VoiceAgent] Manual send error:', err));
        }
      } catch {
        /* ignore */
      }
    });

    session.on('agent_state_changed', (ev: any) => {
      console.log(`[VoiceAgent] ${ev.oldState} → ${ev.newState}`);
    });

    session.on('error', (ev: any) => {
      console.error('[VoiceAgent] Error:', ev.error);
      // Notify the UI so user sees the error instead of infinite loading
      sendDataEvent({
        type: 'assistant-complete',
        text: 'Voice encountered an error. Please try again or use text mode.',
      });
    });

    // ── Usage metering — one report per session, on close or job shutdown ──
    const usageCollector = new metricsModule.UsageCollector();
    session.on('metrics_collected', (ev: any) => usageCollector.collect(ev.metrics));

    const sessionId: string = nodeCrypto.randomUUID();
    const sessionStartedAt = Date.now();
    let usageReported = false;
    const reportUsage = async () => {
      if (usageReported) return;
      usageReported = true;
      const summary = usageCollector.getSummary();
      await reportSessionUsage({
        sessionId,
        conversationId: authContext.conversationId,
        userId: authContext.userId,
        tenantId: authContext.tenantId,
        sttModel,
        ttsModel,
        sttAudioMs: Math.round(summary.sttAudioDurationMs),
        ttsCharacters: summary.ttsCharactersCount,
        sessionMs: Date.now() - sessionStartedAt,
      });
    };
    session.on('close', () => void reportUsage());
    ctx.addShutdownCallback(reportUsage);

    const agent = new voiceModule.Agent({ instructions: '' });

    try {
      console.log('[VoiceAgent] Starting session...');
      await session.start({ agent, room: ctx.room });
      console.log('[VoiceAgent] Session started — listening');
      session.say('Hey, the assistant here. What can I help you with?');
    } catch (err) {
      console.error('[VoiceAgent] Session start failed:', err);
    }
  },
});
