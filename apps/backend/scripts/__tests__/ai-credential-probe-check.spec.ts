import { generateText as generateTextImport } from 'ai';
import { MODEL_CATALOG } from '../../src/domains/ai/routing/model-catalog';
import { PROBE_MAX_OUTPUT_TOKENS } from '../../src/domains/ai/routing/connect/ai-credential-probe.service';
import { runProbeChecks } from '../ai-credential-probe-check';

jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn() }));
const generateText = generateTextImport as jest.Mock;

/** The live probe check spends money and runs by hand; this runs its wiring offline with the AI SDK call mocked. */
describe('ai-credential-probe-check (offline)', () => {
  beforeEach(() => generateText.mockReset());

  it('runs nothing and calls no provider when no key is set', async () => {
    const { lines, skipped } = await runProbeChecks({});
    expect(lines).toEqual([]);
    expect(skipped).toHaveLength(3);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('probes each type whose key is set, through the real probe, on the fast alias at the probe ceiling', async () => {
    generateText.mockResolvedValue({ usage: { totalTokens: 3 } });
    const { lines, skipped } = await runProbeChecks({
      ANTHROPIC_API_KEY: 'sk-ant-test-0000',
      AI_GATEWAY_API_KEY: 'vck-test',
    });
    expect(lines.map((l) => [l.type, l.ok])).toEqual([
      ['ANTHROPIC_KEY', true],
      ['VERCEL_GATEWAY_KEY', true],
    ]);
    expect(skipped).toEqual(['OPENROUTER_KEY (OPENROUTER_API_KEY is not set)']);
    expect(generateText.mock.calls[0][0].maxOutputTokens).toBe(PROBE_MAX_OUTPUT_TOKENS);
    expect(generateText.mock.calls[1][0].model.modelId).toBe(MODEL_CATALOG.fast.openrouterId);
  });

  it('reports a refused key as FAIL with the secret redacted', async () => {
    generateText.mockRejectedValue(new Error('invalid x-api-key sk-ant-test-0000-secret'));
    const { lines } = await runProbeChecks({ ANTHROPIC_API_KEY: 'sk-ant-test-0000-secret' });
    expect(lines[0].ok).toBe(false);
    expect(lines[0].detail).not.toContain('sk-ant-test-0000-secret');
  });
});
