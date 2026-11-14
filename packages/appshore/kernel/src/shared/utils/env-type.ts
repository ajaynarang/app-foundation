import { Logger } from '@nestjs/common';
import { ALLOWED_ENV_TYPES, type EnvType } from './env-label';

export type { EnvType, ObservabilityEnv } from './env-label';
export { isDevelopmentEnv, resolveObservabilityEnv } from './env-label';

let cachedEnvType: EnvType | null = null;
let warnedStaging = false;

export function getEnvType(): EnvType {
  if (cachedEnvType) return cachedEnvType;

  const raw = process.env.ENV_TYPE?.toLowerCase();

  if (raw === 'staging') {
    if (!warnedStaging) {
      new Logger('EnvType').warn('ENV_TYPE=staging is deprecated; treating as sandbox. Set ENV_TYPE=sandbox instead.');
      warnedStaging = true;
    }
    cachedEnvType = 'sandbox';
    return cachedEnvType;
  }

  if (raw && (ALLOWED_ENV_TYPES as readonly string[]).includes(raw)) {
    cachedEnvType = raw as EnvType;
    return cachedEnvType;
  }

  throw new Error(
    'ENV_TYPE is required and must be one of: production | sandbox | preprod | development (temp: staging→sandbox)',
  );
}
