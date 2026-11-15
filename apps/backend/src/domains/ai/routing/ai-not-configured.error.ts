import { ServiceUnavailableException } from '@nestjs/common';
import { AI_ERROR_CODE } from '@app/shared-types';

/** What a reader with no say over the deployment's AI is told. */
export const AI_NOT_CONFIGURED_DETAIL =
  'AI is not configured on this deployment yet. Ask your administrator to set up an AI provider.';

/**
 * No usable route exists for a need: no platform route that serves it is configured (and, with bring-your-own-key,
 * no workspace credential serves it either). 503: the feature exists but this deployment cannot serve it yet. A
 * keyless developer machine lands here and everything else keeps working.
 *
 * Distinct from `ZeroRetentionUnavailable` (400), where a route exists but the workspace's retention policy rules it
 * out. `detail` is replaced only where the reader is known (the chat route says who can connect a key).
 */
export class AiNotConfigured extends ServiceUnavailableException {
  constructor(
    readonly need: string,
    detail: string = AI_NOT_CONFIGURED_DETAIL,
  ) {
    super({ statusCode: 503, code: AI_ERROR_CODE.AI_NOT_CONFIGURED, detail, need });
  }
}
