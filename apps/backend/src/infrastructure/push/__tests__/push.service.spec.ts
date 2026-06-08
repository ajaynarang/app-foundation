import { Test, TestingModule } from '@nestjs/testing';
import { PushService } from '../push.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('PushService', () => {
  let service: PushService;

  const mockPrisma = {
    pushSubscription: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        VAPID_PUBLIC_KEY: 'test-public-key',
        VAPID_PRIVATE_KEY: 'test-private-key',
        VAPID_SUBJECT: 'mailto:sally-support@appshore.in',
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
    it('should save a push subscription for a user', async () => {
      const sub = {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'key1', auth: 'key2' },
      };
      mockPrisma.pushSubscription.create.mockResolvedValue({ id: 1, ...sub });

      await service.saveSubscription(1, 1, sub);

      expect(mockPrisma.pushSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            tenantId: 1,
            endpoint: sub.endpoint,
          }),
        }),
      );
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
