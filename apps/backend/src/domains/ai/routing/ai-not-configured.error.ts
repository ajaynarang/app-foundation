import { ServiceUnavailableException } from '@nestjs/common';

/**
 * No usable route exists for a need: no platform route that serves it is configured (and, with bring-your-own-key,
 * no workspace credential serves it either). 503: the feature exists but this deployment cannot serve it yet. A
 * keyless developer machine lands here and everything else keeps working.
 *
 * Distinct from `ZeroRetentionUnavailable` (400), where a route exists but the workspace's retention policy rules it
 * out.
 */
export class AiNotConfigured extends ServiceUnavailableException {
  constructor(readonly need: string) {
    super({
      statusCode: 503,
      detail: 'AI is not configured on this deployment yet. Ask your administrator to set up an AI provider.',
      need,
    });
  }
}
