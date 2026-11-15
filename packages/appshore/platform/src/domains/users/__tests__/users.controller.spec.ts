import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import { UsersController } from '../users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let service: any;

  const currentUser = { tenantId: 'tenant_abc', role: 'OWNER' };

  beforeEach(() => {
    service = {
      listUsers: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      getUser: jest.fn().mockResolvedValue({ userId: 'usr_1' }),
      createUser: jest.fn().mockResolvedValue({ userId: 'usr_new' }),
      updateUser: jest.fn().mockResolvedValue({ userId: 'usr_1' }),
      deleteUser: jest.fn().mockResolvedValue({ message: 'User deactivated successfully' }),
      toggleUserStatus: jest.fn().mockResolvedValue({ message: 'User activated successfully' }),
    };
    controller = new UsersController(service);
  });

  it("getAllUsers lists the caller's workspace as a cursor list", async () => {
    const query = await readQueryDto(UserListQueryDto, { q: ' ada ', limit: '10', cursor: 'abc' });
    const page = await controller.getAllUsers(currentUser, query);
    expect(service.listUsers).toHaveBeenCalledWith(
      'tenant_abc',
      expect.objectContaining({ q: 'ada', limit: 10, cursor: 'abc' }),
    );
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('getAllUsers answers 400 on offset paging or a limit that is not a number', async () => {
    await expect(readQueryDto(UserListQueryDto, { offset: '10' })).rejects.toMatchObject({ status: 400 });
    await expect(readQueryDto(UserListQueryDto, { limit: 'abc' })).rejects.toMatchObject({ status: 400 });
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
      role: 'MEMBER',
    };
    await controller.createUser(dto as any, currentUser);
    expect(service.createUser).toHaveBeenCalledWith(dto, 'tenant_abc');
  });

  it('updateUser delegates to service', async () => {
    const dto = { firstName: 'Jane' };
    await controller.updateUser('usr_1', dto, currentUser);
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
