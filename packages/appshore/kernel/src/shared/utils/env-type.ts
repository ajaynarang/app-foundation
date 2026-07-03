import { Logger } from '@nestjs/common';

export type EnvType = 'production' | 'sandbox' | 'preprod' | 'development';

let cachedEnvType: EnvType | null = null;
let warnedStaging = false;

export function getEnvType(): EnvType {
  if (cachedEnvType) return cachedEnvType;

  const raw = process.env.ENV_TYPE?.toLowerCase();
  const allowed: EnvType[] = ['production', 'sandbox', 'preprod', 'development'];

  if (raw === 'staging') {
    if (!warnedStaging) {
      new Logger('EnvType').warn('ENV_TYPE=staging is deprecated; treating as sandbox. Set ENV_TYPE=sandbox instead.');
      warnedStaging = true;
    }
    cachedEnvType = 'sandbox';
    return cachedEnvType;
  }

  if (raw && (allowed as string[]).includes(raw)) {
    cachedEnvType = raw as EnvType;
    return cachedEnvType;
  }

  throw new Error(
    'ENV_TYPE is required and must be one of: production | sandbox | preprod | development (temp: staging→sandbox)',
  );
}
