import { ApiKeysController } from '../api-keys.controller';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: any;
  let prisma: any;

  const req = { user: { dbId: 1 } } as any;
  const authUser = { tenantId: 'tenant-7' } as const;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 501, key: 'sk_staging_abc' }),
      findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      revoke: jest.fn().mockResolvedValue(undefined),
      listForTenant: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      rotate: jest.fn().mockResolvedValue({
        apiKey: { id: 501 },
        plaintextKey: 'sk_live_new',
      }),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      revokeForTenant: jest.fn().mockResolvedValue(undefined),
      updateScopes: jest.fn().mockResolvedValue({ id: 501 }),
    };
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, tenantId: 'tenant-7' }),
      },
    };
    controller = new ApiKeysController(prisma, service);
  });

  it('create delegates to service with user dbId', async () => {
    const dto = { name: 'My Key' };
    await controller.create(req, dto as any);
    expect(service.create).toHaveBeenCalledWith(1, dto);
  });

  it('findAll delegates to service', async () => {
    const page = await controller.findAll(req, { limit: 10, cursor: 'abc' });
    expect(service.findAll).toHaveBeenCalledWith(1, { limit: 10, cursor: 'abc' });
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('revoke delegates to service', async () => {
    await controller.revoke(req, 501);
    expect(service.revoke).toHaveBeenCalledWith(501, 1);
  });

  it('listForTenant resolves tenantId and delegates', async () => {
    await controller.listForTenant(authUser, { limit: 10 });
    expect(prisma.tenant.findUnique).toHaveBeenCalled();
    expect(service.listForTenant).toHaveBeenCalledWith(7, { limit: 10 });
  });

  it('rotate resolves tenantId and delegates', async () => {
    await controller.rotate(authUser, 501);
    expect(service.rotate).toHaveBeenCalledWith(501, 7);
  });

  it('pause / resume / revokeForTenant / updateScopes delegate with tenantId', async () => {
    await controller.pause(authUser, 501);
    await controller.resume(authUser, 501);
    await controller.revokeForTenant(authUser, 501);
    await controller.updateScopes(authUser, 501, {
      scopes: ['platform:read'],
    } as any);
    expect(service.pause).toHaveBeenCalledWith(501, 7);
    expect(service.resume).toHaveBeenCalledWith(501, 7);
    expect(service.revokeForTenant).toHaveBeenCalledWith(501, 7);
    expect(service.updateScopes).toHaveBeenCalledWith(501, 7, expect.objectContaining({ scopes: ['platform:read'] }));
  });
});
