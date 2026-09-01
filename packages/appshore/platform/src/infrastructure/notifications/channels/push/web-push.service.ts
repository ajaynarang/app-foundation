import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import * as webpush from 'web-push';

interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly isConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT') || 'mailto:support@example.com';

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.isConfigured = true;
        this.logger.log('Web Push configured with VAPID keys');
      } catch (error: any) {
        this.isConfigured = false;
        this.logger.warn(`Web Push not configured — invalid VAPID keys: ${error.message}`);
      }
    } else {
      this.isConfigured = false;
      this.logger.warn('Web Push not configured — VAPID keys missing');
    }
  }

  async saveSubscription(userId: number, tenantId: number, subscription: PushSubscriptionInput) {
    // An endpoint identifies a BROWSER, not a person, and a browser has exactly
    // one owner at a time. If someone else still claims this endpoint they signed
    // out of it — leaving their row in place would push their draws and match
    // times to whoever is sitting at this machine now.
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: subscription.endpoint, userId: { not: userId } },
    });

    // Upsert, not create. A browser's push endpoint is STABLE, so subscribing
    // twice — toggling off then on, or simply re-opening settings on a browser
    // that already subscribed — sends the same endpoint again. Against the
    // @@unique([userId, endpoint]) that is a 409, which surfaced to the user as
    // "couldn't turn on push notifications" on the most ordinary path there is.
    // The keys can legitimately rotate for a stable endpoint, so refresh them.
    return this.prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint: subscription.endpoint } },
      create: {
        userId,
        tenantId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: subscription.userAgent,
      },
      update: {
        tenantId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: subscription.userAgent,
      },
    });
  }

  async removeSubscription(userId: number, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async getSubscriptionsForUser(userId: number) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
    });
  }

  /** Returns how many subscriptions were actually reached — zero is not success. */
  async sendPushToUser(
    userId: number,
    payload: { title: string; body: string; url?: string; tag?: string },
  ): Promise<number> {
    if (!this.isConfigured) {
      this.logger.warn('Push not sent — VAPID not configured');
      return 0;
    }

    const subscriptions = await this.getSubscriptionsForUser(userId);
    let delivered = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        delivered += 1;
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
          this.logger.log(`Removed expired push subscription for user ${userId}`);
        } else {
          this.logger.error(`Push send failed for user ${userId}: ${error.message}`);
        }
      }
    }

    return delivered;
  }

  getPublicKey(): string | undefined {
    return this.configService.get<string>('VAPID_PUBLIC_KEY');
  }
}
