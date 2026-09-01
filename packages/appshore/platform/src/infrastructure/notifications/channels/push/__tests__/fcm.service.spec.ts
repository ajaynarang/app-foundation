import { DevicePlatform } from '@appshore/db';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';
import { FcmService } from '../fcm.service';
import { initializeFirebase, admin } from '../../../../../config/firebase.config';

jest.mock('../../../../../config/firebase.config', () => ({
  initializeFirebase: jest.fn(),
  admin: { messaging: jest.fn() },
}));

const USER_DB_ID = 42;
const TENANT_DB_ID = 7;

const FIREBASE_ENV_KEYS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const;

function setFirebaseEnv() {
  process.env.FIREBASE_PROJECT_ID = 'app-test';
  process.env.FIREBASE_CLIENT_EMAIL = 'svc@app-test.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';
}

function clearFirebaseEnv() {
  for (const key of FIREBASE_ENV_KEYS) delete process.env[key];
}

describe('FcmService', () => {
  let prisma: any;
  let sendEachForMulticast: jest.Mock;

  beforeEach(() => {
    prisma = createMockPrisma();
    // NotificationDevice is an app table until it joins foundation.prisma; the fixture does not know it yet.
    prisma.notificationDevice = {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    sendEachForMulticast = jest.fn();
    (initializeFirebase as jest.Mock).mockReturnValue({ name: 'fake-app' });
    (admin.messaging as unknown as jest.Mock).mockReturnValue({ sendEachForMulticast });
    clearFirebaseEnv();
  });

  afterAll(() => clearFirebaseEnv());

  describe('when Firebase credentials are absent', () => {
    it('no-ops on send without touching the device registry and without throwing', async () => {
      const service = new FcmService(prisma);

      await expect(service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' })).resolves.toBe(0);

      expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('still registers devices — tokens collected now work the moment keys arrive', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.upsert.mockResolvedValue({ id: 1 });

      await service.registerDevice(USER_DB_ID, TENANT_DB_ID, 'tok-1', DevicePlatform.ANDROID);

      expect(prisma.notificationDevice.upsert).toHaveBeenCalled();
    });
  });

  describe('registerDevice', () => {
    it('upserts on the token so a device changing hands is reassigned, not duplicated', async () => {
      setFirebaseEnv();
      const service = new FcmService(prisma);
      prisma.notificationDevice.upsert.mockResolvedValue({ id: 1 });

      await service.registerDevice(USER_DB_ID, TENANT_DB_ID, 'tok-1', DevicePlatform.IOS);

      expect(prisma.notificationDevice.upsert).toHaveBeenCalledWith({
        where: { token: 'tok-1' },
        create: { userId: USER_DB_ID, tenantId: TENANT_DB_ID, token: 'tok-1', platform: DevicePlatform.IOS },
        update: expect.objectContaining({
          userId: USER_DB_ID,
          tenantId: TENANT_DB_ID,
          platform: DevicePlatform.IOS,
        }),
      });
    });
  });

  describe('removeDevice', () => {
    it('deletes only the caller-owned row for that token', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeDevice(USER_DB_ID, 'tok-1');

      expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_DB_ID, token: 'tok-1' },
      });
    });
  });

  describe('sendToUser (configured)', () => {
    beforeEach(() => setFirebaseEnv());

    it('multicasts to every registered device of the user', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([
        { id: 1, token: 'tok-1' },
        { id: 2, token: 'tok-2' },
      ]);
      sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }, { success: true }] });

      await service.sendToUser(USER_DB_ID, { title: 'Match scheduled', body: 'Court 1', data: { type: 'X' } });

      expect(sendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['tok-1', 'tok-2'],
        notification: { title: 'Match scheduled', body: 'Court 1' },
        data: { type: 'X' },
      });
    });

    it('skips the multicast entirely when the user has no devices', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([]);

      await service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' });

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('prunes tokens FCM reports as dead and keeps the rest', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([
        { id: 1, token: 'dead' },
        { id: 2, token: 'alive' },
      ]);
      sendEachForMulticast.mockResolvedValue({
        responses: [
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: true },
        ],
      });

      await service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' });

      expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
    });

    it('does NOT prune on messaging/invalid-argument — payload errors must never delete healthy tokens', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([{ id: 1, token: 'healthy' }]);
      sendEachForMulticast.mockResolvedValue({
        responses: [{ success: false, error: { code: 'messaging/invalid-argument' } }],
      });

      await service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' });

      expect(prisma.notificationDevice.deleteMany).not.toHaveBeenCalled();
    });

    it('degrades to a logged failure when messaging initialization throws on malformed credentials', async () => {
      (initializeFirebase as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to parse private key');
      });
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([{ id: 1, token: 'tok-1' }]);

      await expect(service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' })).resolves.toBe(0);

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('logs and swallows a multicast failure — push is best-effort', async () => {
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([{ id: 1, token: 'tok-1' }]);
      sendEachForMulticast.mockRejectedValue(new Error('fcm down'));

      await expect(service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' })).resolves.toBe(0);
    });

    it('no-ops when Firebase app initialization returns null', async () => {
      (initializeFirebase as jest.Mock).mockReturnValue(null);
      const service = new FcmService(prisma);
      prisma.notificationDevice.findMany.mockResolvedValue([{ id: 1, token: 'tok-1' }]);

      await service.sendToUser(USER_DB_ID, { title: 'T', body: 'B' });

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });
  });
});
