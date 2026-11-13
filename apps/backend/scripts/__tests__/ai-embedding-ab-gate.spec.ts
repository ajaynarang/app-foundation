import { embedMany as embedManyImport } from 'ai';
import { CORPUS, EXIT, runAbGate } from '../ai-embedding-ab-gate';

jest.mock('ai', () => ({ ...jest.requireActual('ai'), embedMany: jest.fn() }));
const embedMany = embedManyImport as jest.Mock;

const KEYS = { COHERE_API_KEY: 'co-test', PLATFORM_BEDROCK_REGION: 'us-east-1' };

/** A unit vector at 1536 dimensions, pointing mostly along `axis`. */
function vector(axis: number, tilt = 0): number[] {
  const v = new Array(1536).fill(0);
  v[axis] = 1;
  v[(axis + 1) % 1536] = tilt;
  return v;
}

/** The gate spends money and runs by hand; this runs its decisions offline with the embedding calls mocked. */
describe('ai-embedding-ab-gate (offline)', () => {
  beforeEach(() => embedMany.mockReset());

  it('is NOT RUN (exit 2), never a pass, when a key is missing, and calls no provider', async () => {
    for (const env of [{}, { COHERE_API_KEY: 'co-test' }, { PLATFORM_BEDROCK_REGION: 'us-east-1' }]) {
      const result = await runAbGate(env);
      expect(result.exitCode).toBe(EXIT.NOT_RUN);
      expect(result.lines.join('\n')).toMatch(/not a pass/i);
    }
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('embeds about 100 texts through both legs, as documents at 1536 dimensions', async () => {
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map((_, ix) => vector(ix)),
    }));
    await runAbGate(KEYS);
    expect(CORPUS.length).toBeGreaterThanOrEqual(100);
    const models = new Set(embedMany.mock.calls.map((c) => c[0].model.modelId));
    expect(models).toEqual(new Set(['embed-v4.0', 'cohere.embed-v4:0']));
    for (const [args] of embedMany.mock.calls) {
      expect(args.providerOptions.cohere).toEqual({ inputType: 'search_document', outputDimension: 1536 });
      expect(args.providerOptions.bedrock).toEqual({ inputType: 'search_document', outputDimension: 1536 });
    }
    const sent = embedMany.mock.calls.reduce((n, [args]) => n + args.values.length, 0);
    expect(sent).toBe(CORPUS.length * 2);
  });

  it('passes (exit 0) when every pair is at least 0.99 similar', async () => {
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map((_, ix) => vector(ix)),
    }));
    const result = await runAbGate(KEYS);
    expect(result.exitCode).toBe(EXIT.PASS);
    expect(result.min).toBeCloseTo(1, 6);
  });

  it('fails (exit 1) on a measured divergence and names the worst texts', async () => {
    let leg = 0;
    embedMany.mockImplementation(async ({ values, model }: { values: string[]; model: { modelId: string } }) => {
      leg = model.modelId === 'embed-v4.0' ? 0 : 1;
      return { embeddings: values.map((_, ix) => vector(ix, leg === 1 && ix === 3 ? 0.5 : 0)) };
    });
    const result = await runAbGate(KEYS);
    expect(result.exitCode).toBe(EXIT.DIVERGED);
    expect(result.min).toBeLessThan(0.99);
    expect(result.lines.join('\n')).toMatch(/only embedding route/);
  });

  it('errors (exit 3), not a divergence, when a leg throws or returns the wrong dimension', async () => {
    embedMany.mockRejectedValueOnce(new Error('UnrecognizedClientException'));
    expect((await runAbGate(KEYS)).exitCode).toBe(EXIT.ERRORED);

    embedMany.mockResolvedValue({ embeddings: [new Array(1024).fill(0)] });
    expect((await runAbGate(KEYS)).exitCode).toBe(EXIT.ERRORED);
  });
});
