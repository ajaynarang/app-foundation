import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when a tenant requires zero-data-retention (ZDR) AI routing but no
 * ZDR-eligible model is configured for the requested tier. We FAIL CLOSED
 * here (block the call) rather than silently routing through a
 * data-retaining endpoint — for a compliance-flagged tenant, leaking the
 * prompt to a retaining provider is the worst outcome.
 *
 * 400 (BadRequest) because it's a configuration/eligibility problem the
 * operator must resolve (configure a ZDR route, or clear the tenant flag),
 * not a transient failure.
 */
export class ZeroRetentionUnavailable extends BadRequestException {
  constructor(tier: string) {
    super({
      statusCode: 400,
      detail:
        'This AI feature is unavailable because your account requires zero-data-retention routing and no compliant model is configured for it. Contact support.',
      tier,
    });
  }
}
