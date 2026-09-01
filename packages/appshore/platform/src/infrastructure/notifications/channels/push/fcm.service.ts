import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { initializeFirebase, admin } from '../../../../config/firebase.config';
import { DevicePlatform } from '@appshore/db';

export interface FcmPushPayload {
  title: string;
  body: string;
  /** Extra key/value data for tap-through routing — values must be strings (FCM contract). */
  data?: Record<string, string>;
}

/**
 * FCM error codes that mean "this token is dead — delete it, don't retry it".
 * Deliberately NOT `messaging/invalid-argument`: FCM raises that for payload
 * problems too, and a bad payload must never prune healthy tokens.
 */
const DEAD_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Mobile push via Firebase Cloud Messaging — the FCM complement to the
 * foundation's web-push PushService (VAPID). Reads the
 * NotificationDevice registry (`POST /notifications/devices`).
 *
 * Degrades gracefully: when the FIREBASE_* credentials are absent, the service
 * logs ONCE at startup and every send is a silent no-op — never a throw.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly enabled: boolean;
  private messaging: admin.messaging.Messaging | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.enabled = Boolean(
      process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY,
    );
    if (this.enabled) {
      this.logger.log('FCM push enabled (Firebase credentials found)');
    } else {
      this.logger.log('FCM push disabled — Firebase credentials not configured; mobile push will no-op');
    }
  }

  async registerDevice(userDbId: number, tenantDbId: number, token: string, platform: DevicePlatform) {
    const device = await this.prisma.notificationDevice.upsert({
      where: { token },
      create: { userId: userDbId, tenantId: tenantDbId, token, platform },
      // A device that changes hands (logout → another user logs in) is
      // reassigned, never duplicated — token is the natural key.
      update: { userId: userDbId, tenantId: tenantDbId, platform, lastSeenAt: new Date() },
    });
    return device;
  }

  async removeDevice(userDbId: number, token: string) {
    return this.prisma.notificationDevice.deleteMany({ where: { userId: userDbId, token } });
  }

  /**
   * Send to every registered device of one user. Dead tokens are pruned; all
   * other failures are logged and swallowed — push is a best-effort channel.
   */
  /** Returns how many devices were actually reached — zero is not success. */
  async sendToUser(userDbId: number, payload: FcmPushPayload): Promise<number> {
    if (!this.enabled) return 0;

    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: userDbId },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return 0;

    try {
      // Inside the try: malformed credentials make firebase-admin throw on
      // initialization, and that must degrade to a logged failure, not a crash.
      const messaging = this.getMessaging();
      if (!messaging) return 0;

      const result = await messaging.sendEachForMulticast({
        tokens: devices.map((d) => d.token),
        notification: { title: payload.title, body: payload.body },
        ...(payload.data ? { data: payload.data } : {}),
      });

      const deadDeviceIds: number[] = [];
      result.responses.forEach((response, index) => {
        if (response.success) return;
        const code = response.error?.code ?? 'unknown';
        if (DEAD_TOKEN_ERROR_CODES.has(code)) {
          deadDeviceIds.push(devices[index].id);
        } else {
          this.logger.warn(`FCM send failed for user ${userDbId}: ${code}`);
        }
      });

      if (deadDeviceIds.length > 0) {
        await this.prisma.notificationDevice.deleteMany({ where: { id: { in: deadDeviceIds } } });
        this.logger.log(`Pruned ${deadDeviceIds.length} dead FCM token(s) for user ${userDbId}`);
      }

      return result.successCount;
    } catch (error: any) {
      this.logger.error(`FCM multicast failed for user ${userDbId}: ${error.message}`);
      return 0;
    }
  }

  private getMessaging(): admin.messaging.Messaging | null {
    if (this.messaging) return this.messaging;
    const app = initializeFirebase();
    if (!app) return null;
    this.messaging = admin.messaging(app);
    return this.messaging;
  }
}
