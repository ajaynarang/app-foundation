import { ConfigService } from '@nestjs/config';
import { VoiceAgentWorker } from '../voice-agent.worker';
import { DEV_VOICE_AGENT_SECRET_DEFAULT } from '../../../../config/configuration';

/**
 * The forked voice agent authenticates to a public endpoint with
 * VOICE_AGENT_SECRET. The worker may fall back to the public development
 * value only outside production.
 */
describe('VoiceAgentWorker — shared secret', () => {
  const ORIGINAL_ENV = process.env;

  function workerFor(environment: string) {
    const values: Record<string, unknown> = { LIVEKIT_URL: 'wss://voice.acme.io', environment };
    const config = { get: (name: string, fallback?: unknown) => values[name] ?? fallback } as unknown as ConfigService;
    const worker = new VoiceAgentWorker(config);
    const startWorker = jest
      .spyOn(worker as unknown as { startWorker: () => Promise<void> }, 'startWorker')
      .mockResolvedValue(undefined);
    return { worker, startWorker };
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VOICE_AGENT_SECRET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('in production with no secret: does not substitute the development default and does not start', async () => {
    const { worker, startWorker } = workerFor('production');
    await worker.onModuleInit();
    expect(process.env.VOICE_AGENT_SECRET).toBeUndefined();
    expect(startWorker).not.toHaveBeenCalled();
  });

  it('in development with no secret: uses the declared development default', async () => {
    const { worker, startWorker } = workerFor('development');
    await worker.onModuleInit();
    expect(process.env.VOICE_AGENT_SECRET).toBe(DEV_VOICE_AGENT_SECRET_DEFAULT);
    expect(startWorker).toHaveBeenCalled();
  });

  it('keeps a secret that is set', async () => {
    process.env.VOICE_AGENT_SECRET = 'f3a91c0e5b7d48a2c6e0913f5d7b2a4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1f';
    const { worker, startWorker } = workerFor('production');
    await worker.onModuleInit();
    expect(process.env.VOICE_AGENT_SECRET).toBe('f3a91c0e5b7d48a2c6e0913f5d7b2a4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1f');
    expect(startWorker).toHaveBeenCalled();
  });
});
