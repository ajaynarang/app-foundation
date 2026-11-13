import { ServiceUnavailableException } from '@nestjs/common';
import { AI_ERROR_CODE } from '@app/shared-types';

/**
 * A workspace's own credentials would serve the need, but none of them can: every one is FAILING, or the one picked
 * cannot be read (the operator removed or changed `AI_CREDENTIALS_KEY`). The payer boundary is never crossed: a
 * workspace whose key fails is blocked, never silently served (and billed) on the platform's key. 503: transient from
 * the workspace's view, and the fix is theirs.
 */
export class AiCredentialFailing extends ServiceUnavailableException {
  constructor(readonly need: string) {
    super({
      statusCode: 503,
      code: AI_ERROR_CODE.AI_CREDENTIAL_FAILING,
      detail:
        "Your workspace's AI credential is failing and needs attention. The workspace owner can test or reconnect it in Settings.",
      need,
    });
  }
}
