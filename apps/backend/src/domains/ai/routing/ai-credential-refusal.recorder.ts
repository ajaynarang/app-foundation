import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_FROZEN_24H } from '@appshore/kernel/constants/cache.constants';
import { NotificationTriggersService } from '../../notifications/notification-triggers.service';

import type { CreditRefusalSink } from './ai-route-resolver.service';
import { redactSecret } from './connect/redact-secret';

/** The once-a-day claim per credential. */
export function creditRefusedClaimKey(credentialPublicId: string): string {
  return buildKey('app:ai-routing', 'credit-refused', credentialPublicId);
}

/**
 * A provider refused a call on a workspace's own key for credit (`isProviderCreditRefusal`). The credential's
 * `lastError` gets the redacted reason and its owners and admins are told, at most once a day per credential (an atomic
 * Redis claim, so replicas do not double up). The status stays ACTIVE on purpose: a low-credit key can still pass the
 * one-token test, so FAILING here would flap back at the next sweep. FAILING stays for keys the provider rejects
 * outright. Never throws: the AI call already has its own error to return.
 */
@Injectable()
export class AiCredentialRefusalRecorder implements CreditRefusalSink {
  private readonly logger = new Logger(AiCredentialRefusalRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly notifications: NotificationTriggersService,
  ) {}

  async recordCreditRefusal(tenantId: number, credentialPublicId: string, detail: string): Promise<void> {
    try {
      const credential = await this.prisma.aiCredential.findFirst({
        where: { tenantId, publicId: credentialPublicId },
        select: { type: true, lastFour: true },
      });
      if (!credential) return;
      if (!(await this.cache.claim(creditRefusedClaimKey(credentialPublicId), true, CACHE_TTL_FROZEN_24H))) return;
      await this.prisma.aiCredential.updateMany({
        where: { tenantId, publicId: credentialPublicId },
        data: { lastError: `The provider refused a call for credit: ${redactSecret(detail)}` },
      });
      await this.notifications.aiCredentialFailing(tenantId, credential, 'credit-refused');
    } catch (err) {
      this.logger.warn(`Credit refusal on ${credentialPublicId} not recorded: ${(err as Error).message}`);
    }
  }
}
