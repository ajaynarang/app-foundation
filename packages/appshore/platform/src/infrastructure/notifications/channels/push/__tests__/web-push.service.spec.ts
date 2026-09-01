import { Test, TestingModule } from '@nestjs/testing';
import { PushService } from '../web-push.service';
import { PrismaService } from '../../../../database/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('PushService', () => {
  let service: PushService;

  const mockPrisma = {
    pushSubscription: {
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        VAPID_PUBLIC_KEY: 'test-public-key',
        VAPID_PRIVATE_KEY: 'test-private-key',
        VAPID_SUBJECT: 'mailto:support@appshore.in',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    jest.clearAllMocks();
  });

  describe('saveSubscription', () => {
    const sub = {
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'key1', auth: 'key2' },
    };

    it('should save a push subscription for a user', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 1, ...sub });

      await service.saveSubscription(1, 1, sub);

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_endpoint: { userId: 1, endpoint: sub.endpoint } },
          create: expect.objectContaining({
            userId: 1,
            tenantId: 1,
            endpoint: sub.endpoint,
          }),
        }),
      );
    });

    it('survives the same browser subscribing twice', async () => {
      // A browser's endpoint is STABLE, so toggling push off then on — or just
      // re-opening settings — re-sends it. `create` against the
      // @@unique([userId, endpoint]) made that a 409, which reached the user as
      // "couldn't turn on push notifications" on the most ordinary path there is.
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 1, ...sub });

      await service.saveSubscription(1, 1, sub);
      await service.saveSubscription(1, 1, sub);

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.pushSubscription.create).not.toHaveBeenCalled();
    });

    it('takes the endpoint away from whoever held it before', async () => {
      // An endpoint identifies a BROWSER, not a person. If user A signs out and
      // user B signs in on the same machine, A's row still points at B's browser
      // — and A's draws and match times would buzz on B's screen.
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 2, ...sub });

      await service.saveSubscription(2, 1, sub);

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: sub.endpoint, userId: { not: 2 } },
      });
    });
  });

  describe('getSubscriptionsForUser', () => {
    it('should return all push subscriptions for a user', async () => {
      mockPrisma.pushSubscription.findMany.mockResolvedValue([{ endpoint: 'https://push.example.com/abc' }]);

      const result = await service.getSubscriptionsForUser(1);

      expect(result).toHaveLength(1);
    });
  });
});
