import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Every model call names its output ceiling (`domains/ai/routing/output-ceilings.ts`).
 *
 * Left unset, some routes ask the provider for the model's whole output window, and a key with a tight credit limit (a
 * capped workspace key, a tenant's own key) refuses the call outright. `StructuredOutputService.extract` makes
 * `maxOutputTokens` required, so the build catches a structured call without one; tests alone would not, because
 * ts-jest runs with type checks off. This spec (comments ignored) covers both that and the calls the type system cannot hold: the raw
 * AI SDK calls (`generateText`, `streamText`, `generateObject`, `streamObject`) and Mastra agent calls
 * (`agent.stream`, `agent.generate`, `agent.resumeStream`), whose options carry the ceiling under `modelSettings`.
 *
 * The check is textual: the call's argument list must mention `maxOutputTokens`.
 */

const SRC = path.resolve(__dirname, '..');
const MODEL_CALL =
  /(?:\.extract\s*(?:<[^>()]*>)?|\bgenerateText|\bstreamText|\bgenerateObject|\bstreamObject|\bagent\.(?:stream|generate|resumeStream))\s*\(/g;

/** The text between a call's opening parenthesis (at `open`) and its matching close. */
function argumentText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** Calls in `source` whose arguments do not mention `maxOutputTokens`, as `line: call`. */
function callsWithoutCeiling(raw: string): string[] {
  const source = stripComments(raw);
  const out: string[] = [];
  for (const match of source.matchAll(MODEL_CALL)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    if (!/\bmaxOutputTokens\b/.test(argumentText(source, open))) {
      const line = source.slice(0, match.index).split('\n').length;
      out.push(`${line}: ${match[0].replace(/\s+/g, '')}`);
    }
  }
  return out;
}

describe('every model call names an output ceiling', () => {
  it('flags a call without maxOutputTokens and passes one with it', () => {
    expect(callsWithoutCeiling(`await this.structured.extract<{ a: string }>({ schema, timeoutMs: 1 });`)).toEqual([
      '1: .extract<{a:string}>(',
    ]);
    expect(callsWithoutCeiling(`await generateText({ model, prompt, maxOutputTokens: CEILING });`)).toEqual([]);
    expect(callsWithoutCeiling(`await agent.stream(msg, { modelSettings: { maxOutputTokens: X } });`)).toEqual([]);
    expect(callsWithoutCeiling(`await agent.generate(msg, { toolsets });`)).toEqual(['1: agent.generate(']);
  });

  it('no model call under apps/backend/src leaves its ceiling to the provider', () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC)) {
      for (const call of callsWithoutCeiling(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SRC, file)}:${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
