import type { LanguageModelMiddleware } from 'ai';
import {
  PROMPT_CACHE_STRATEGIES,
  cacheBreakpoint,
  promptCacheMiddleware,
  type PromptCacheStrategy,
} from '../prompt-cache';

type Params = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0]['params'];

async function transform(strategy: PromptCacheStrategy, prompt: any[]): Promise<any[]> {
  const params = { prompt } as unknown as Params;
  const result = await promptCacheMiddleware(strategy).transformParams?.({
    params,
    type: 'generate',
    model: {} as never,
  });
  return (result as unknown as { prompt: any[] }).prompt;
}

const MARKERS: Record<Exclude<PromptCacheStrategy, 'none'>, Record<string, unknown>> = {
  anthropic: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  openrouter: { openrouter: { cacheControl: { type: 'ephemeral' } } },
  bedrock: { bedrock: { cachePoint: { type: 'default' } } },
};

describe('promptCacheMiddleware', () => {
  it('has a marker for every strategy but none', () => {
    for (const strategy of PROMPT_CACHE_STRATEGIES) {
      if (strategy === 'none') expect(cacheBreakpoint(strategy)).toBeUndefined();
      else expect(cacheBreakpoint(strategy)).toEqual(MARKERS[strategy]);
    }
  });

  describe.each(Object.entries(MARKERS) as Array<[Exclude<PromptCacheStrategy, 'none'>, Record<string, unknown>]>)(
    'on the %s strategy',
    (strategy, marker) => {
      it('marks the system message on a one-shot extraction and leaves the unique input uncached', async () => {
        const prompt = await transform(strategy, [
          { role: 'system', content: 'Extract the fields.' },
          { role: 'user', content: [{ type: 'text', text: 'a large unique document' }] },
        ]);
        expect(prompt[0].providerOptions).toEqual(marker);
        expect(prompt[1].providerOptions).toBeUndefined();
      });

      it('also marks the last message once the conversation has an assistant turn', async () => {
        const prompt = await transform(strategy, [
          { role: 'system', content: 'You are the assistant.' },
          { role: 'user', content: [{ type: 'text', text: 'what is open?' }] },
          { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'find', input: {} }] },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'find', output: {} }] },
        ]);
        expect(prompt[0].providerOptions).toEqual(marker);
        expect(prompt[1].providerOptions).toBeUndefined();
        expect(prompt[2].providerOptions).toBeUndefined();
        expect(prompt[3].providerOptions).toEqual(marker);
      });
    },
  );

  it('marks only the last of several system messages', async () => {
    const prompt = await transform('anthropic', [
      { role: 'system', content: 'instructions' },
      { role: 'system', content: 'memory' },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(prompt[0].providerOptions).toBeUndefined();
    expect(prompt[1].providerOptions).toEqual(MARKERS.anthropic);
  });

  it('keeps existing provider options on a marked message', async () => {
    const prompt = await transform('openrouter', [
      { role: 'system', content: 'x', providerOptions: { openrouter: { foo: 1 }, anthropic: { effort: 'low' } } },
    ]);
    expect(prompt[0].providerOptions).toEqual({
      openrouter: { foo: 1, cacheControl: { type: 'ephemeral' } },
      anthropic: { effort: 'low' },
    });
  });

  it('adds nothing on the none strategy', async () => {
    const prompt = await transform('none', [
      { role: 'system', content: 'x' },
      { role: 'assistant', content: [] },
      { role: 'user', content: [] },
    ]);
    expect(prompt.every((m) => m.providerOptions === undefined)).toBe(true);
  });

  it('does not mutate the caller prompt', async () => {
    const original = [{ role: 'system', content: 'x' }];
    await transform('anthropic', original);
    expect(original[0]).toEqual({ role: 'system', content: 'x' });
  });
});
