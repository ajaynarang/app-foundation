import { Injectable } from '@nestjs/common';
import { AiCredentialType } from '@appshore/db';
import { generateText } from 'ai';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import type { ProbeResult } from '@app/shared-types';

import { OUTPUT_CEILINGS } from '../output-ceilings';
import { tunedLanguageModel } from '../model-tuning.middleware';
import { PASTE_KEY_TYPES, TENANT_CREDENTIAL_CAPABILITIES, type PasteKeyType } from '../route-registry';
import { bedrockSessionName } from '../aws-role-naming';
import { redactSecret } from './redact-secret';

/** STS's shortest session: the probe only proves the role can be assumed. */
const PROBE_SESSION_SECONDS = 900;

/** The error names STS answers an `AssumeRole` the trust policy refuses with. Anything else proves nothing. */
const ACCESS_DENIED = new Set(['AccessDenied', 'AccessDeniedException']);

/** A workspace AWS role to test: its ARN and region, the external id the server computed, and the session naming. */
export interface BedrockProbeInput {
  roleArn: string;
  externalId: string;
  awsRegion: string;
  /** The credential's public id (a new one at connect): it names the STS session. */
  credentialPublicId: string;
  projectSlug: string;
}

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

  /**
   * The confused-deputy check on a workspace AWS role, in both directions, then one model call. `AssumeRole` WITH the
   * external id must succeed, and WITHOUT it must be refused with an explicit access-denied: a role that lets us in
   * without the id could be assumed on behalf of any workspace. A transient error on the second call proves nothing,
   * so it is a refusal, never a pass. Then one small call on the `fast` alias through the `BEDROCK_ROLE` registry entry
   * proves model access. STS is signed by the backend's own ambient credentials, the principal the tenant trusts. The
   * temporary credentials STS returns are discarded, never stored or returned.
   */
  async probeBedrock(input: BedrockProbeInput): Promise<ProbeResult> {
    const startedAt = Date.now();
    const failed = (detail: string): ProbeResult => ({ ok: false, latencyMs: Date.now() - startedAt, detail });
    const sessionName = bedrockSessionName(input.projectSlug, input.credentialPublicId);
    const sts = new STSClient({ region: input.awsRegion });

    try {
      await sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          ExternalId: input.externalId,
          RoleSessionName: sessionName,
          DurationSeconds: PROBE_SESSION_SECONDS,
        }),
      );
    } catch (err) {
      return failed(`Could not assume the role with the external id: ${reason(err)}`);
    }

    try {
      await sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          RoleSessionName: sessionName,
          DurationSeconds: PROBE_SESSION_SECONDS,
        }),
      );
      return failed(
        'The role can be assumed without the external id, so its trust policy is not pinned. Add the sts:ExternalId ' +
          'condition and try again: storing this role would leave it open to confused-deputy misuse.',
      );
    } catch (err) {
      if (!ACCESS_DENIED.has(err instanceof Error ? err.name : '')) {
        return failed(
          `Could not prove the role requires the external id (AWS answered with an error, not a refusal; try again): ${reason(err)}`,
        );
      }
    }

    try {
      const bundle = TENANT_CREDENTIAL_CAPABILITIES[AiCredentialType.BEDROCK_ROLE].buildProvider(
        {
          type: AiCredentialType.BEDROCK_ROLE,
          publicId: input.credentialPublicId,
          roleArn: input.roleArn,
          externalId: input.externalId,
          awsRegion: input.awsRegion,
        },
        null,
        { projectSlug: input.projectSlug },
      );
      const base = bundle.languageModel;
      if (!base) throw new Error('the Bedrock route serves no language model');
      await generateText({
        model: tunedLanguageModel(base, 'fast', bundle.effortFamily ?? 'bedrock'),
        prompt: 'Reply with the single word: ready',
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        detail: 'OK: the role requires the external id and the model answered',
      };
    } catch (err) {
      return failed(
        `The role checks out but the model call failed (enable model access for Claude in the account's Bedrock console): ${reason(err)}`,
      );
    }
  }
}

/** A provider or AWS error as safe text: redacted, capped, never a credential. */
function reason(err: unknown): string {
  return redactSecret(err instanceof Error ? err.message : String(err));
}
