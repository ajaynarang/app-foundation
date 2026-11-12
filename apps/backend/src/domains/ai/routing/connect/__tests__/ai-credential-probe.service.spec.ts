jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn() }));

const stsSend = jest.fn();
jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({ send: stsSend })),
  AssumeRoleCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { AiCredentialType } from '@appshore/db';
import { generateText } from 'ai';
import { STSClient as STSClientImport } from '@aws-sdk/client-sts';
import { AiCredentialProbeService, PROBE_MAX_OUTPUT_TOKENS, PROBE_TIMEOUT_MS } from '../ai-credential-probe.service';
import { TENANT_CREDENTIAL_CAPABILITIES } from '../../route-registry';
import { MODEL_CATALOG } from '../../model-catalog';

const mockGenerateText = generateText as jest.Mock;
const STSClient = STSClientImport as unknown as jest.Mock;

const denied = (name = 'AccessDenied') =>
  Object.assign(new Error('not authorized to perform sts:AssumeRole'), { name });

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

  describe('probeBedrock (the confused-deputy check, both directions)', () => {
    const input = {
      roleArn: 'arn:aws:iam::123456789012:role/acme-bedrock-access',
      externalId: 'acme-ws_abc123',
      awsRegion: 'eu-west-1',
      credentialPublicId: 'aicred_role00001',
      projectSlug: 'acme',
    };

    it('passes when AssumeRole WITH the external id succeeds, WITHOUT it is denied, and the model answers', async () => {
      stsSend.mockResolvedValueOnce({ Credentials: {} }).mockRejectedValueOnce(denied());
      mockGenerateText.mockResolvedValue({ usage: { totalTokens: 1 } });

      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(true);
      expect(stsSend).toHaveBeenCalledTimes(2);
      const withId = stsSend.mock.calls[0][0].input;
      const withoutId = stsSend.mock.calls[1][0].input;
      expect(withId).toMatchObject({
        RoleArn: input.roleArn,
        ExternalId: input.externalId,
        RoleSessionName: 'acme-aicred_role00001',
      });
      expect(withoutId.RoleArn).toBe(input.roleArn);
      expect(withoutId).not.toHaveProperty('ExternalId');
      // The model call goes through the BEDROCK_ROLE registry entry on the catalog's Bedrock id, at the probe ceiling.
      const call = mockGenerateText.mock.calls[0][0];
      expect(call.model.modelId).toBe(MODEL_CATALOG.fast.bedrockId);
      expect(call.maxOutputTokens).toBe(PROBE_MAX_OUTPUT_TOKENS);
    });

    it('signs STS with the ambient credentials only (the task role the tenant trusts), in the tenant region', async () => {
      stsSend.mockResolvedValueOnce({ Credentials: {} }).mockRejectedValueOnce(denied());
      mockGenerateText.mockResolvedValue({ usage: { totalTokens: 1 } });
      await service.probeBedrock(input);
      expect(STSClient).toHaveBeenCalledWith({ region: 'eu-west-1' });
    });

    it('fails when AssumeRole WITH the external id is refused, and calls no model', async () => {
      stsSend.mockRejectedValueOnce(denied());
      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/could not assume the role with the external id/i);
      expect(stsSend).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('REFUSES when AssumeRole succeeds WITHOUT the external id (the trust policy is not pinned)', async () => {
      stsSend.mockResolvedValueOnce({ Credentials: {} }).mockResolvedValueOnce({ Credentials: {} });
      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/without the external id/i);
      expect(result.detail).toMatch(/confused-deputy/i);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('REFUSES when the check without the external id fails with a transient error (the pin is not proven)', async () => {
      stsSend
        .mockResolvedValueOnce({ Credentials: {} })
        .mockRejectedValueOnce(Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' }));
      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/could not prove/i);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('fails with a model-access hint when the role checks out but the model call is refused', async () => {
      stsSend.mockResolvedValueOnce({ Credentials: {} }).mockRejectedValueOnce(denied('AccessDeniedException'));
      mockGenerateText.mockRejectedValue(new Error('AccessDeniedException: model access is not enabled'));
      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/model access/i);
    });

    it('never returns the temporary credentials STS handed out', async () => {
      stsSend
        .mockResolvedValueOnce({ Credentials: { SecretAccessKey: 'tmp-secret-value-123', SessionToken: 'tok' } })
        .mockRejectedValueOnce(denied());
      mockGenerateText.mockResolvedValue({ usage: { totalTokens: 1 } });
      const result = await service.probeBedrock(input);
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/tmp-secret-value-123|SessionToken|tok/);
    });
  });
});
