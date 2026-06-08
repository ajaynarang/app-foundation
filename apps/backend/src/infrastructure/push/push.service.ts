import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
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
    const subject = this.configService.get<string>('VAPID_SUBJECT') || 'mailto:sally-support@appshore.in';

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
    return this.prisma.pushSubscription.create({
      data: {
        userId,
        tenantId,
        endpoint: subscription.endpoint,
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

  async sendPushToUser(userId: number, payload: { title: string; body: string; url?: string; tag?: string }) {
    if (!this.isConfigured) {
      this.logger.warn('Push not sent — VAPID not configured');
      return;
    }

    const subscriptions = await this.getSubscriptionsForUser(userId);

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
          this.logger.log(`Removed expired push subscription for user ${userId}`);
        } else {
          this.logger.error(`Push send failed for user ${userId}: ${error.message}`);
        }
      }
    }
  }

  getPublicKey(): string | undefined {
    return this.configService.get<string>('VAPID_PUBLIC_KEY');
  }
}
