jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn() }));

import { AiCredentialType } from '@appshore/db';
import { generateText } from 'ai';
import { AiCredentialProbeService, PROBE_MAX_OUTPUT_TOKENS, PROBE_TIMEOUT_MS } from '../ai-credential-probe.service';
import { TENANT_CREDENTIAL_CAPABILITIES } from '../../route-registry';
import { MODEL_CATALOG } from '../../model-catalog';

const mockGenerateText = generateText as jest.Mock;

describe('AiCredentialProbeService', () => {
  const service = new AiCredentialProbeService();

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('passes on one small call on the fast alias, with the probe ceiling and a timeout', async () => {
    mockGenerateText.mockResolvedValue({ usage: { totalTokens: 2 } });
    const result = await service.probeKey(AiCredentialType.OPENROUTER_KEY, 'sk-or-v1-fakekey12345');
    expect(result).toMatchObject({ ok: true, latencyMs: expect.any(Number) });
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.maxOutputTokens).toBe(PROBE_MAX_OUTPUT_TOKENS);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.model.modelId).toBe(MODEL_CATALOG.fast.openrouterId);
    expect(PROBE_TIMEOUT_MS).toBe(15_000);
  });

  it('builds the provider only through the registry entry of the type, never a client of its own', async () => {
    mockGenerateText.mockResolvedValue({ usage: { totalTokens: 1 } });
    const build = jest.spyOn(TENANT_CREDENTIAL_CAPABILITIES.ANTHROPIC_KEY, 'buildProvider');
    await service.probeKey(AiCredentialType.ANTHROPIC_KEY, 'sk-ant-fakefakefake123');
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ type: 'ANTHROPIC_KEY' }), 'sk-ant-fakefakefake123');
  });

  it('redacts the pasted secret from a failure detail', async () => {
    const secret = 'my-provider-secret-value-123';
    mockGenerateText.mockRejectedValue(new Error(`invalid api key: ${secret}`));
    const result = await service.probeKey(AiCredentialType.ANTHROPIC_KEY, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).not.toContain(secret);
    expect(result.detail).toContain('[redacted]');
  });

  it('a type with no paste-key route fails the probe instead of calling anything', async () => {
    const result = await service.probeKey(AiCredentialType.BEDROCK_ROLE, 'whatever-secret');
    expect(result.ok).toBe(false);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
