import { UsersController } from '../users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let service: any;

  const currentUser = { tenantId: 'tenant_abc', role: 'OWNER' };

  beforeEach(() => {
    service = {
      getAllUsers: jest.fn().mockResolvedValue([]),
      getUser: jest.fn().mockResolvedValue({ userId: 'usr_1' }),
      createUser: jest.fn().mockResolvedValue({ userId: 'usr_new' }),
      updateUser: jest.fn().mockResolvedValue({ userId: 'usr_1' }),
      deleteUser: jest.fn().mockResolvedValue({ message: 'User deactivated successfully' }),
      toggleUserStatus: jest.fn().mockResolvedValue({ message: 'User activated successfully' }),
    };
    controller = new UsersController(service);
  });

  it('getAllUsers delegates to service with currentUser', async () => {
    await controller.getAllUsers(currentUser);
    expect(service.getAllUsers).toHaveBeenCalledWith('tenant_abc', currentUser);
  });

  it('getUser delegates to service', async () => {
    await controller.getUser('usr_1', currentUser);
    expect(service.getUser).toHaveBeenCalledWith('usr_1', 'tenant_abc');
  });

  it('createUser delegates to service', async () => {
    const dto = {
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      role: 'DISPATCHER',
    };
    await controller.createUser(dto as any, currentUser);
    expect(service.createUser).toHaveBeenCalledWith(dto, 'tenant_abc');
  });

  it('updateUser delegates to service', async () => {
    const dto = { firstName: 'Jane' };
    await controller.updateUser('usr_1', dto as any, currentUser);
    expect(service.updateUser).toHaveBeenCalledWith('usr_1', dto, 'tenant_abc', currentUser);
  });

  it('deleteUser delegates to service', async () => {
    await controller.deleteUser('usr_1', currentUser);
    expect(service.deleteUser).toHaveBeenCalledWith('usr_1', 'tenant_abc', currentUser);
  });

  it('deactivateUser calls toggleUserStatus with false', async () => {
    await controller.deactivateUser('usr_1', currentUser);
    expect(service.toggleUserStatus).toHaveBeenCalledWith('usr_1', false, 'tenant_abc', currentUser);
  });

  it('activateUser calls toggleUserStatus with true', async () => {
    await controller.activateUser('usr_1', currentUser);
    expect(service.toggleUserStatus).toHaveBeenCalledWith('usr_1', true, 'tenant_abc', currentUser);
  });
});
