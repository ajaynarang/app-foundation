import { PrismaClient } from '../../generated/client';

/**
 * Model pricing catalog — per-million-token rates for every provider/model
 * pair the platform currently routes traffic through. Used by `AiTelemetryService`
 * to compute USD cost per invocation at write time.
 *
 * Placeholder rates — verify against your providers' current pricing pages
 * (and any gateway markup you pay) before deploying. The 4.x Anthropic rows
 * were verified against list pricing on 2026-06-11; OpenAI rows are unverified.
 * The Claude 5.5 rows come from Anthropic's price table as cached on
 * 2026-11-03, not the live page. OpenRouter passes Anthropic list prices
 * through with no token markup, so its rows mirror the Anthropic ones; they
 * are checked against the live slugs when the OpenRouter route lands. The
 * Cohere row is a copy of a sibling product's unverified row.
 *
 * Old rows stay: the ledger prices history by model id, so a model bump adds
 * rows and never deletes the ones it replaces.
 *
 * Pricing is data, not code: in production, prices are updated by inserting
 * a new row with `effectiveFromDate = today` and setting
 * `effectiveUntilDate` on the old row. Never UPDATE in place — it breaks
 * historical cost reconciliation.
 *
 * Idempotency: this seed is upsert-keyed by `(provider, model,
 * effectiveFromDate)`. Re-running it without changes is a no-op.
 */

interface PricingRow {
  provider: string;
  model: string;
  inputPerMtokUsd: string;
  outputPerMtokUsd: string;
  cachedInputPerMtokUsd: string | null;
  notes: string;
  /** Defaults to `INITIAL_EFFECTIVE_FROM_DATE`; a row added later carries the date it was added. */
  effectiveFromDate?: Date;
}

const VERIFIED_ANTHROPIC = 'Verified against Anthropic list pricing 2026-06-11';
const VERIFICATION_NEEDED = '⚠ Placeholder — verify against provider docs before deploy';

// effective_from_date for the initial seed row. Pinned to the date the
// schema landed so subsequent verified rows can supersede via
// effectiveUntilDate.
const INITIAL_EFFECTIVE_FROM_DATE = new Date('2026-05-27T00:00:00.000Z');

// The Claude 5.5 generation, Cohere embeddings and OpenRouter rows.
const CLAUDE_5_5_EFFECTIVE_FROM_DATE = new Date('2026-11-12T00:00:00.000Z');
const ANTHROPIC_5_5 = "From Anthropic's price table cached 2026-11-03; ⚠ verify against the live page before deploy";
const VIA_OPENROUTER = `Anthropic list pricing via OpenRouter (no token markup). ${VERIFICATION_NEEDED}`;

const PRICING: PricingRow[] = [
  // ─── Anthropic ─────────────────────────────────────────────────────
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    inputPerMtokUsd: '1.000000',
    outputPerMtokUsd: '5.000000',
    cachedInputPerMtokUsd: '0.100000',
    notes: VERIFIED_ANTHROPIC,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    inputPerMtokUsd: '3.000000',
    outputPerMtokUsd: '15.000000',
    cachedInputPerMtokUsd: '0.300000',
    notes: VERIFIED_ANTHROPIC,
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    inputPerMtokUsd: '5.000000',
    outputPerMtokUsd: '25.000000',
    cachedInputPerMtokUsd: '0.500000',
    notes: VERIFIED_ANTHROPIC,
  },

  // Claude 5.5 (fast / standard / powerful). Cache reads are 10% of input
  // except Sonnet 5.5, which Anthropic lists at $0.10 (not $0.20).
  {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    inputPerMtokUsd: '0.100000',
    outputPerMtokUsd: '0.500000',
    cachedInputPerMtokUsd: '0.010000',
    notes: `Base rate only: Haiku 5.5 bills $0.50 / $2.50 per million above 100K prompt tokens, so a call that large is understated (the telemetry writer warns). ${ANTHROPIC_5_5}`,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    inputPerMtokUsd: '2.000000',
    outputPerMtokUsd: '10.000000',
    cachedInputPerMtokUsd: '0.100000',
    notes: ANTHROPIC_5_5,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    inputPerMtokUsd: '4.000000',
    outputPerMtokUsd: '20.000000',
    cachedInputPerMtokUsd: '0.200000',
    notes: ANTHROPIC_5_5,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },

  // ─── OpenRouter (the platform default language route) ──────────────
  {
    provider: 'openrouter',
    model: 'anthropic/claude-haiku-5.5',
    inputPerMtokUsd: '0.100000',
    outputPerMtokUsd: '0.500000',
    cachedInputPerMtokUsd: '0.010000',
    notes: `Base rate only (Haiku 5.5 bills more above 100K prompt tokens). ${VIA_OPENROUTER}`,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-5.5',
    inputPerMtokUsd: '2.000000',
    outputPerMtokUsd: '10.000000',
    cachedInputPerMtokUsd: '0.100000',
    notes: VIA_OPENROUTER,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-opus-5.5',
    inputPerMtokUsd: '4.000000',
    outputPerMtokUsd: '20.000000',
    cachedInputPerMtokUsd: '0.200000',
    notes: VIA_OPENROUTER,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },

  // ─── Cohere (the one embedding model, Embed v4 at 1536) ────────────
  {
    provider: 'cohere',
    model: 'embed-v4.0',
    inputPerMtokUsd: '0.120000',
    outputPerMtokUsd: '0.000000',
    cachedInputPerMtokUsd: null,
    notes: `Embeddings: output cost is 0. ${VERIFICATION_NEEDED}`,
    effectiveFromDate: CLAUDE_5_5_EFFECTIVE_FROM_DATE,
  },

  // ─── OpenAI ────────────────────────────────────────────────────────
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPerMtokUsd: '2.500000',
    outputPerMtokUsd: '10.000000',
    cachedInputPerMtokUsd: '1.250000',
    notes: VERIFICATION_NEEDED,
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPerMtokUsd: '0.150000',
    outputPerMtokUsd: '0.600000',
    cachedInputPerMtokUsd: '0.075000',
    notes: VERIFICATION_NEEDED,
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-small',
    inputPerMtokUsd: '0.020000',
    outputPerMtokUsd: '0.000000',
    cachedInputPerMtokUsd: null,
    notes: `Embeddings: output cost is 0 (no completion tokens). ${VERIFICATION_NEEDED}`,
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-large',
    inputPerMtokUsd: '0.130000',
    outputPerMtokUsd: '0.000000',
    cachedInputPerMtokUsd: null,
    notes: `Embeddings: output cost is 0 (no completion tokens). ${VERIFICATION_NEEDED}`,
  },
];

export const seed = {
  name: 'Model Pricing',
  description: `Seeds ${PRICING.length} model_pricing rows for AI cost telemetry`,

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const row of PRICING) {
      const effectiveFromDate = row.effectiveFromDate ?? INITIAL_EFFECTIVE_FROM_DATE;
      const existing = await prisma.modelPricing.findUnique({
        where: {
          provider_model_effectiveFromDate: {
            provider: row.provider,
            model: row.model,
            effectiveFromDate,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.modelPricing.create({
        data: {
          provider: row.provider,
          model: row.model,
          inputPerMtokUsd: row.inputPerMtokUsd,
          outputPerMtokUsd: row.outputPerMtokUsd,
          cachedInputPerMtokUsd: row.cachedInputPerMtokUsd,
          effectiveFromDate,
          effectiveUntilDate: null,
          notes: row.notes,
        },
      });
      created++;
    }

    return { created, skipped };
  },
};
