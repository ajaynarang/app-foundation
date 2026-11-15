import { ServiceUnavailableException } from '@nestjs/common';

/**
 * The resolved route has no model id for this alias: the catalog left that alias's column empty because the model
 * could not be confirmed on that route (`UNREGISTERED_ALIASES` in `model-catalog.ts`). The route refuses rather than
 * serving an older model. 503: this deployment cannot serve that alias on that route.
 */
export class AiModelNotOnRoute extends ServiceUnavailableException {
  constructor(
    readonly alias: string,
    readonly routeId: string,
  ) {
    super({
      statusCode: 503,
      detail: 'This AI model is not available on the configured provider. Ask your administrator to check the setup.',
      alias,
      routeId,
    });
  }
}
