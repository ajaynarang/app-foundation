import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppConsentSource } from '@appshore/db';
import { PrismaService } from '../../../database/prisma.service';
import type { WhatsAppConsent } from '@app/shared-types';
import type { WhatsAppConsentKind } from './whatsapp-template.registry';

interface ConsentRow {
  optedInAt: Date | null;
  optedOutAt: Date | null;
  marketingOptedInAt: Date | null;
  marketingOptedOutAt: Date | null;
}

/** A yes that has not been followed by a later no. */
const isOn = (inAt: Date | null, outAt: Date | null): boolean =>
  inAt !== null && (outAt === null || outAt.getTime() < inAt.getTime());

const toView = (row: ConsentRow | null): WhatsAppConsent => ({
  optedIn: row ? isOn(row.optedInAt, row.optedOutAt) : false,
  marketingOptedIn: row ? isOn(row.marketingOptedInAt, row.marketingOptedOutAt) : false,
});

/**
 * Per person, not per club. Meta requires the business to hold the opt-in;
 * this is where it is held, and absence means no.
 */
@Injectable()
export class WhatsAppConsentService {
  private readonly logger = new Logger(WhatsAppConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number): Promise<WhatsAppConsent> {
    return toView(await this.prisma.whatsAppConsent.findUnique({ where: { userId } }));
  }

  /** Only the fields present move; each is a timestamp, so the newer one wins. */
  async update(
    userId: number,
    patch: { optedIn?: boolean; marketingOptedIn?: boolean },
    source: WhatsAppConsentSource,
  ): Promise<WhatsAppConsent> {
    const now = new Date();
    const changes: Partial<ConsentRow> = {};
    if (patch.optedIn === true) changes.optedInAt = now;
    if (patch.optedIn === false) changes.optedOutAt = now;
    if (patch.marketingOptedIn === true) changes.marketingOptedInAt = now;
    if (patch.marketingOptedIn === false) changes.marketingOptedOutAt = now;

    const row = await this.prisma.whatsAppConsent.upsert({
      where: { userId },
      create: { userId, source, ...changes },
      update: { source, ...changes },
    });
    return toView(row);
  }

  /** An inbound STOP. Returns false when nobody holds that number — and never logs it. */
  async optOutByPhone(phone: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({ where: { phone }, select: { id: true } });
    if (!user) return false;
    await this.update(user.id, { optedIn: false }, WhatsAppConsentSource.INBOUND_STOP);
    this.logger.log(`WhatsApp opt-out by STOP for user ${user.id}`);
    return true;
  }

  /** One query for a whole audience — the resolver calls this, never get() in a loop. */
  async consentedUserIds(userIds: number[], kind: WhatsAppConsentKind = 'utility'): Promise<Set<number>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.whatsAppConsent.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, optedInAt: true, optedOutAt: true, marketingOptedInAt: true, marketingOptedOutAt: true },
    });
    const on = (r: ConsentRow) =>
      kind === 'marketing' ? isOn(r.marketingOptedInAt, r.marketingOptedOutAt) : isOn(r.optedInAt, r.optedOutAt);
    return new Set(rows.filter(on).map((r) => r.userId));
  }
}
