import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { OutboundAdminController } from '../outbound-admin.controller';
import type { OutboundAdminService } from '../outbound-admin.service';

describe('OutboundAdminController', () => {
  const service = {
    getStatus: jest.fn().mockReturnValue({ mode: 'allowlist' }),
    listEntries: jest.fn().mockResolvedValue([]),
    createEntry: jest.fn().mockResolvedValue({ id: 'e1' }),
    deleteEntry: jest.fn().mockResolvedValue(undefined),
    listSuppressions: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
  };
  const controller = new OutboundAdminController(service as unknown as OutboundAdminService);

  beforeEach(() => jest.clearAllMocks());

  it('is for super-admins only, on every route', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OutboundAdminController)).toEqual(['SUPER_ADMIN']);
  });

  it('passes the signed-in user as the author of a new entry', async () => {
    await controller.createEntry({ kind: 'EMAIL', value: 'qa@example.com' }, { dbId: 9 });
    expect(service.createEntry).toHaveBeenCalledWith({ kind: 'EMAIL', value: 'qa@example.com' }, 9);
  });

  it('delegates status, list, delete and held-back to the service', async () => {
    expect(controller.getStatus()).toEqual({ mode: 'allowlist' });
    await controller.listEntries();
    await expect(controller.deleteEntry('e1')).resolves.toBeUndefined();
    await controller.listSuppressions({ limit: 10 });

    expect(service.listEntries).toHaveBeenCalled();
    expect(service.deleteEntry).toHaveBeenCalledWith('e1');
    expect(service.listSuppressions).toHaveBeenCalledWith({ limit: 10 });
  });
});
