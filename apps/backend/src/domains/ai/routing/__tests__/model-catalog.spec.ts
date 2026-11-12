import * as fs from 'fs';
import * as path from 'path';
import { MODEL_ALIASES } from '@app/shared-types';
import {
  AI_PROVIDER_LABELS,
  EMBEDDING_CATALOG,
  LEGACY_EMBEDDING,
  MODEL_CATALOG,
  ROUTE_ID_COLUMNS,
  UNREGISTERED_ALIASES,
  ledgerModelIdFor,
  longPromptSurchargeAbove,
} from '../model-catalog';

const PRICING_SEED = path.resolve(
  __dirname,
  '../../../../../../../packages/appshore/db/prisma/seeds/08-model-pricing.seed.ts',
);

/** `(provider, model)` pairs the pricing seed declares, read from its source. */
function pricedPairs(): Set<string> {
  const text = fs.readFileSync(PRICING_SEED, 'utf8');
  const pairs = new Set<string>();
  for (const m of text.matchAll(/provider:\s*'([^']+)',\s*model:\s*'([^']+)'/g)) pairs.add(`${m[1]}|${m[2]}`);
  return pairs;
}

/** Which ledger provider label prices each route id column. */
const PROVIDER_FOR_COLUMN: Record<(typeof ROUTE_ID_COLUMNS)[number], string> = {
  anthropicId: AI_PROVIDER_LABELS.ANTHROPIC,
  openrouterId: AI_PROVIDER_LABELS.OPENROUTER,
};

describe('MODEL_CATALOG', () => {
  it.each(ROUTE_ID_COLUMNS.flatMap((column) => MODEL_ALIASES.map((alias) => [column, alias] as const)))(
    '%s is set for %s, or the alias is listed as unregistered on that column',
    (column, alias) => {
      const id = MODEL_CATALOG[alias][column];
      const unregistered = (UNREGISTERED_ALIASES[column] ?? []).includes(alias);
      if (unregistered) expect(id).toBeUndefined();
      else expect(id).toEqual(expect.any(String));
    },
  );

  it('uses the Claude 5.5 ids: dashed on the direct API, vendor-prefixed and dotted on OpenRouter', () => {
    expect(MODEL_CATALOG.fast).toMatchObject({
      anthropicId: 'claude-haiku-5-5',
      openrouterId: 'anthropic/claude-haiku-5.5',
    });
    expect(MODEL_CATALOG.standard).toMatchObject({
      anthropicId: 'claude-sonnet-5-5',
      openrouterId: 'anthropic/claude-sonnet-5.5',
    });
    expect(MODEL_CATALOG.powerful).toMatchObject({
      anthropicId: 'claude-opus-5-5',
      openrouterId: 'anthropic/claude-opus-5.5',
    });
  });

  it('never carries a 4.x model id on any column (owner decision: no 4.x fallback)', () => {
    for (const alias of MODEL_ALIASES) {
      for (const column of ROUTE_ID_COLUMNS) {
        const id = MODEL_CATALOG[alias][column];
        if (id) expect(id).not.toMatch(/claude-[a-z]+-4([-.]|$)/);
      }
    }
  });

  it('sets effort low on fast and medium on standard and powerful, and declares zero-retention capability', () => {
    expect(MODEL_ALIASES.map((a) => MODEL_CATALOG[a].effort)).toEqual(['low', 'medium', 'medium']);
    for (const alias of MODEL_ALIASES) expect(typeof MODEL_CATALOG[alias].zdrCapable).toBe('boolean');
  });

  it('has a pricing row for every provider and id pair a route can record', () => {
    const priced = pricedPairs();
    const missing: string[] = [];
    for (const column of ROUTE_ID_COLUMNS) {
      for (const alias of MODEL_ALIASES) {
        const id = MODEL_CATALOG[alias][column];
        if (id && !priced.has(`${PROVIDER_FOR_COLUMN[column]}|${id}`))
          missing.push(`${PROVIDER_FOR_COLUMN[column]}|${id}`);
      }
    }
    for (const pair of [
      `${AI_PROVIDER_LABELS.COHERE}|${EMBEDDING_CATALOG.cohereDirectId}`,
      `${LEGACY_EMBEDDING.provider}|${LEGACY_EMBEDDING.modelId}`,
    ]) {
      if (!priced.has(pair)) missing.push(pair);
    }
    expect(missing).toEqual([]);
  });
});

describe('EMBEDDING_CATALOG', () => {
  it('pins Cohere Embed v4 at 1536 dimensions on both legs', () => {
    expect(EMBEDDING_CATALOG).toEqual({
      cohereDirectId: 'embed-v4.0',
      bedrockId: 'cohere.embed-v4:0',
      dimensions: 1536,
    });
  });
});

describe('AI_PROVIDER_LABELS', () => {
  it('names the five ledger vendors', () => {
    expect(Object.values(AI_PROVIDER_LABELS).sort()).toEqual(['anthropic', 'aws', 'cohere', 'openai', 'openrouter']);
  });
});

describe('ledgerModelIdFor', () => {
  it('records the alias model when the provider reports nothing', () => {
    expect(ledgerModelIdFor('fast', undefined)).toBe('claude-haiku-5-5');
  });

  it('records the model that answered when a refusal fell back one alias up', () => {
    expect(ledgerModelIdFor('fast', 'claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
    expect(ledgerModelIdFor('fast', 'anthropic/claude-sonnet-5.5')).toBe('claude-sonnet-5-5');
  });

  it('keeps the alias model when the reported id is not one of ours (it would have no pricing row)', () => {
    expect(ledgerModelIdFor('fast', 'claude-haiku-5-5-20261001')).toBe('claude-haiku-5-5');
  });
});

describe('longPromptSurchargeAbove', () => {
  it('flags Haiku 5.5 above 100K prompt tokens, on every id it is recorded under', () => {
    expect(longPromptSurchargeAbove('claude-haiku-5-5')).toBe(100_000);
    expect(longPromptSurchargeAbove('anthropic/claude-haiku-5.5')).toBe(100_000);
  });

  it('is undefined for a model priced at one rate', () => {
    expect(longPromptSurchargeAbove('claude-sonnet-5-5')).toBeUndefined();
    expect(longPromptSurchargeAbove('not-a-model')).toBeUndefined();
  });
});
