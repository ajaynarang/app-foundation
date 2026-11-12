import { Injectable } from '@nestjs/common';
import { AiCredentialType } from '@appshore/db';
import { generateText } from 'ai';
import type { ProbeResult } from '@app/shared-types';

import { OUTPUT_CEILINGS } from '../output-ceilings';
import { tunedLanguageModel } from '../model-tuning.middleware';
import { PASTE_KEY_TYPES, TENANT_CREDENTIAL_CAPABILITIES, type PasteKeyType } from '../route-registry';
import { redactSecret } from './redact-secret';

/** A probe that has not answered in this long has failed. */
export const PROBE_TIMEOUT_MS = 15_000;

/**
 * The probe's output ceiling. The design starts at one token, but thinking is always on for the 5.5 models and is
 * billed as output, so a one-token ceiling can be refused before the key is ever judged. The probe therefore uses the
 * smallest ceiling the template already uses (`OUTPUT_CEILINGS.WORD`). The model still answers in a few tokens; the
 * ceiling only bounds it. `pnpm --filter @app/backend ai:probe-check` runs this probe against real keys.
 */
export const PROBE_MAX_OUTPUT_TOKENS = OUTPUT_CEILINGS.WORD;

/**
 * Live tests of a workspace credential. The provider is built only through the type's registry entry (this service
 * never constructs an SDK client), so the probe calls exactly what the resolver would. One call on the `fast` alias,
 * tuned as the resolver tunes it, with a 15-second timeout. The result's `detail` is always redacted (`redactSecret`)
 * and safe to store or show.
 */
@Injectable()
export class AiCredentialProbeService {
  async probeKey(type: AiCredentialType, secret: string): Promise<ProbeResult> {
    const startedAt = Date.now();
    if (!PASTE_KEY_TYPES.includes(type as PasteKeyType)) {
      return { ok: false, latencyMs: 0, detail: `A ${type} credential cannot be tested on this version` };
    }
    try {
      const bundle = TENANT_CREDENTIAL_CAPABILITIES[type].buildProvider({ type, publicId: 'aicred_probe' }, secret);
      const base = bundle.languageModel;
      if (!base) throw new Error('this credential type serves no language model');
      const result = await generateText({
        model: tunedLanguageModel(base, 'fast', bundle.effortFamily ?? 'anthropic'),
        prompt: 'Reply with the single word: ready',
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        detail: `OK: the model answered (${result.usage?.totalTokens ?? 0} tokens)`,
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, latencyMs: Date.now() - startedAt, detail: redactSecret(raw, secret) };
    }
  }
}
