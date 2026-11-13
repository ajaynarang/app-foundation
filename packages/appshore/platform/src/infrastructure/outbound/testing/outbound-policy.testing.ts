import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service';
import { OutboundPolicyService } from '../outbound-policy.service';
import type { OutboundMode } from '@appshore/kernel/infrastructure/outbound/outbound-mode';

/**
 * A real `OutboundPolicyService` pinned to a mode, for specs. `live` never touches Prisma, so `{}` will do; an
 * `allowlist` spec passes a Prisma mock with `outboundAllowEntry.findMany`, `outboundSuppression.create` and, for
 * push, `user.findUnique`.
 */
export function createOutboundPolicy(
  mode: OutboundMode,
  prisma: unknown = {},
  extra: { bootstrap?: string; envType?: string } = {},
): OutboundPolicyService {
  const values: Record<string, string | undefined> = {
    ENV_TYPE: extra.envType ?? 'sandbox',
    OUTBOUND_MODE: mode,
    OUTBOUND_ALLOWLIST_BOOTSTRAP: extra.bootstrap,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new OutboundPolicyService(prisma as PrismaService, config);
}
