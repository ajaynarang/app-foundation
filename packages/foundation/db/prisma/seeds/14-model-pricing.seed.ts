import { PrismaClient } from '../../generated/client';

/**
 * Model pricing catalog — per-million-token rates for every provider/model
 * pair the platform currently routes traffic through. Used by `AiTelemetryService`
 * to compute USD cost per invocation at write time.
 *
 * Placeholder rates — verify against your providers' current pricing pages
 * (and any gateway markup you pay) before deploying. Anthropic rows were
 * verified against list pricing on 2026-06-11; OpenAI rows are unverified.
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
}

const VERIFIED_ANTHROPIC = 'Verified against Anthropic list pricing 2026-06-11';
const VERIFICATION_NEEDED = '⚠ Placeholder — verify against provider docs before deploy';

// effective_from_date for the initial seed row. Pinned to the date the
// schema landed so subsequent verified rows can supersede via
// effectiveUntilDate.
const INITIAL_EFFECTIVE_FROM_DATE = new Date('2026-05-27T00:00:00.000Z');

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
      const existing = await prisma.modelPricing.findUnique({
        where: {
          provider_model_effectiveFromDate: {
            provider: row.provider,
            model: row.model,
            effectiveFromDate: INITIAL_EFFECTIVE_FROM_DATE,
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
          effectiveFromDate: INITIAL_EFFECTIVE_FROM_DATE,
          effectiveUntilDate: null,
          notes: row.notes,
        },
      });
      created++;
    }

    return { created, skipped };
  },
};
