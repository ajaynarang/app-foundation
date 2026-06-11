import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

/**
 * Voice Agent Worker — starts the LiveKit agent server.
 *
 * The LiveKit Agents SDK forks child processes to handle jobs. The agent
 * entry point (voice-agent.entry.ts) runs the voice pipeline:
 *   Deepgram STT → the assistant API (HTTP on localhost) → Cartesia TTS
 *
 * The forked process calls back to this NestJS server via an internal
 * HTTP endpoint (/api/v1/voice/internal/respond) secured by a shared
 * secret. This lets the agent use the assistant's full AI pipeline (moderation,
 * MCP tools, audit) — identical to text chat.
 */
@Injectable()
export class VoiceAgentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceAgentWorker.name);
  private workerProcess: any = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const livekitUrl = this.config.get<string>('LIVEKIT_URL');
    if (!livekitUrl) {
      this.logger.warn('LIVEKIT_URL not set — voice agent worker disabled');
      return;
    }

    // Use a stable secret — must survive NestJS watch-mode restarts
    // because the forked agent process from the previous run may still
    // be alive with the old secret. In dev, use a fixed default.
    if (!process.env.VOICE_AGENT_SECRET) {
      process.env.VOICE_AGENT_SECRET = 'app-voice-dev-secret-do-not-use-in-production';
      this.logger.warn('VOICE_AGENT_SECRET not set — using dev default. Set a real secret in production.');
    }

    // Set APP_API_URL for the forked process (defaults to localhost)
    if (!process.env.APP_API_URL) {
      const port = this.config.get<number>('PORT', 8001);
      process.env.APP_API_URL = `http://localhost:${port}`;
    }

    await this.startWorker();
  }

  async onModuleDestroy() {
    if (this.workerProcess) {
      this.logger.log('Shutting down voice agent worker...');
      try {
        if (typeof this.workerProcess.close === 'function') {
          await this.workerProcess.close();
        }
      } catch (error) {
        this.logger.warn('Error shutting down voice agent worker', error);
      }
      this.workerProcess = null;
    }
  }

  private async startWorker() {
    const livekitUrl = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    const deepgramKey = this.config.get<string>('DEEPGRAM_API_KEY');
    const cartesiaKey = this.config.get<string>('CARTESIA_API_KEY');

    const missing = [
      !livekitUrl && 'LIVEKIT_URL',
      !apiKey && 'LIVEKIT_API_KEY',
      !apiSecret && 'LIVEKIT_API_SECRET',
      !deepgramKey && 'DEEPGRAM_API_KEY',
      !cartesiaKey && 'CARTESIA_API_KEY',
    ].filter(Boolean);

    if (missing.length > 0) {
      this.logger.warn(`Voice agent worker disabled — missing env vars: ${missing.join(', ')}`);
      return;
    }

    this.logger.log('Initializing voice agent worker...');

    let agents: any;
    try {
      agents = await import('@livekit/agents');
    } catch {
      this.logger.warn('@livekit/agents not installed — voice agent worker disabled');
      return;
    }

    const { AgentServer, ServerOptions, initializeLogger } = agents;

    try {
      if (typeof initializeLogger === 'function') {
        initializeLogger({ pretty: false });
      }

      const entryFile = path.resolve(__dirname, 'voice-agent.entry.js');
      this.logger.log(`Agent entry file: ${entryFile}`);

      const serverOpts = new ServerOptions({
        agent: entryFile,
        agentName: 'app-voice',
        wsURL: livekitUrl,
        apiKey,
        apiSecret,
        numIdleProcesses: 1,
        requestFunc: (req: any) => {
          this.logger.log(`Agent job requested — room=${req.job?.room?.name} id=${req.job?.id}`);
          req.accept();
        },
      });

      const server = new AgentServer(serverOpts);
      this.workerProcess = server;
      this.logger.log(`Voice agent worker started — APP_API_URL=${process.env.APP_API_URL}`);

      // Catch both the run() promise rejection and any unhandled errors
      // from forked child processes to prevent crashing the main NestJS process.
      server.run().catch((error: Error) => {
        this.logger.error('Voice agent worker crashed', error.message);
        this.workerProcess = null;
      });

      // The LiveKit AgentServer forks child processes that can throw
      // unhandled rejections and uncaught exceptions (e.g. "runner
      // initialization timed out", TLS errors). Catch these at the
      // process level to prevent container crashes.
      const voiceErrorHandler = (reason: any) => {
        const msg = reason?.message || String(reason);
        if (
          msg.includes('runner initialization timed out') ||
          msg.includes('job executor') ||
          msg.includes('TLS connection') ||
          msg.includes('socket disconnected') ||
          msg.includes('inference is slower')
        ) {
          this.logger.warn(`Voice agent error (non-fatal): ${msg}`);
        } else {
          this.logger.error(`Voice agent unexpected error: ${msg}`);
        }
      };
      process.on('unhandledRejection', voiceErrorHandler);
      process.on('uncaughtException', (err: Error) => {
        const msg = err?.message || String(err);
        // Only swallow voice-agent related errors — re-throw others
        if (
          msg.includes('TLS connection') ||
          msg.includes('socket disconnected') ||
          msg.includes('runner initialization') ||
          msg.includes('inference is slower')
        ) {
          this.logger.warn(`Voice agent error caught (non-fatal): ${msg}`);
        } else {
          // Not a voice error — let the default handler deal with it
          throw err;
        }
      });
    } catch (error) {
      this.logger.error('Failed to start voice agent worker', error);
    }
  }
}
