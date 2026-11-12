import { ServiceUnavailableException } from '@nestjs/common';

/**
 * A workspace's own credentials would serve the need, but none of them is ACTIVE (they are FAILING). The payer
 * boundary is never crossed: a workspace whose key fails is blocked, never silently served (and billed) on the
 * platform's key. 503: transient from the workspace's view, and the fix is theirs.
 *
 * Raised once workspace credentials exist (bring-your-own-key); the platform-only resolver never throws it.
 */
export class AiCredentialFailing extends ServiceUnavailableException {
  constructor(readonly need: string) {
    super({
      statusCode: 503,
      detail:
        "Your workspace's AI credential is failing and needs attention. The workspace owner can test or reconnect it in Settings.",
      need,
    });
  }
}
