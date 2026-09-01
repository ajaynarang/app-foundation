import { ROLES_KEY } from '../../../../../auth/decorators/roles.decorator';
import { DevicePlatform, UserRole } from '@appshore/db';
import { NotificationDevicesController } from '../devices.controller';

const TENANT_DB_ID = 7;
const USER_DB_ID = 42;

const user = { tenantId: 'tenant_abc', dbId: USER_DB_ID };

describe('NotificationDevicesController', () => {
  let prisma: any;
  let fcmService: { registerDevice: jest.Mock; removeDevice: jest.Mock };
  let controller: NotificationDevicesController;

  beforeEach(() => {
    prisma = { tenant: { findUnique: jest.fn().mockResolvedValue({ id: TENANT_DB_ID }) } };
    fcmService = {
      registerDevice: jest.fn().mockResolvedValue({ id: 1 }),
      removeDevice: jest.fn().mockResolvedValue({ count: 1 }),
    };
    controller = new NotificationDevicesController(prisma as never, fcmService as never);
  });

  it('registers the device against the caller and their tenant, mapping the lowercase platform', async () => {
    const result = await controller.register(user, { token: 'tok-1', platform: 'android' });

    expect(fcmService.registerDevice).toHaveBeenCalledWith(USER_DB_ID, TENANT_DB_ID, 'tok-1', DevicePlatform.ANDROID);
    expect(result).toEqual({ message: 'Device registered for push notifications' });
  });

  it('maps ios to the IOS platform enum', async () => {
    await controller.register(user, { token: 'tok-2', platform: 'ios' });

    expect(fcmService.registerDevice).toHaveBeenCalledWith(USER_DB_ID, TENANT_DB_ID, 'tok-2', DevicePlatform.IOS);
  });

  it('removes only the caller-owned device on DELETE', async () => {
    const result = await controller.remove(user, { token: 'tok-1' });

    expect(fcmService.removeDevice).toHaveBeenCalledWith(USER_DB_ID, 'tok-1');
    expect(result).toEqual({ message: 'Device removed' });
  });

  it('is open to every workspace role — players register their own phones', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, NotificationDevicesController);

    expect(roles).toEqual([UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER]);
  });
});
