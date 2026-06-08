import { OAuthClientsController } from '../oauth-clients.controller';

describe('OAuthClientsController', () => {
  let controller: OAuthClientsController;
  let clientsService: any;

  const adminReq = { user: { role: 'ADMIN', dbId: 1, tenantDbId: 10 } } as any;
  const superAdminReq = {
    user: { role: 'SUPER_ADMIN', dbId: 2, tenantDbId: null },
  } as any;

  beforeEach(() => {
    clientsService = {
      create: jest.fn().mockResolvedValue({ clientId: 'sally_new' }),
      findAll: jest.fn().mockResolvedValue([]),
      findByClientId: jest.fn().mockResolvedValue({ clientId: 'sally_abc' }),
      update: jest.fn().mockResolvedValue({ clientId: 'sally_abc' }),
      revoke: jest.fn().mockResolvedValue(undefined),
      rotateSecret: jest.fn().mockResolvedValue({ clientSecret: 'new-secret' }),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      updateScopes: jest.fn().mockResolvedValue({ clientId: 'sally_abc' }),
    };
    controller = new OAuthClientsController(clientsService);
  });

  it('create uses tenant for ADMIN', async () => {
    await controller.create({ name: 'Test' } as any, adminReq);
    expect(clientsService.create).toHaveBeenCalledWith({ name: 'Test' }, 1, 10);
  });

  it('create uses null tenant for SUPER_ADMIN', async () => {
    await controller.create({ name: 'Test' } as any, superAdminReq);
    expect(clientsService.create).toHaveBeenCalledWith({ name: 'Test' }, 2, null);
  });

  it('findAll uses tenant for ADMIN', async () => {
    await controller.findAll(adminReq);
    expect(clientsService.findAll).toHaveBeenCalledWith(10);
  });

  it('findAll uses null tenant for SUPER_ADMIN', async () => {
    await controller.findAll(superAdminReq);
    expect(clientsService.findAll).toHaveBeenCalledWith(null);
  });

  it('findOne delegates to service', async () => {
    await controller.findOne('sally_abc', adminReq);
    expect(clientsService.findByClientId).toHaveBeenCalledWith('sally_abc', 10);
  });

  it('update delegates to service', async () => {
    await controller.update('sally_abc', { name: 'Updated' } as any, adminReq);
    expect(clientsService.update).toHaveBeenCalledWith('sally_abc', { name: 'Updated' }, 10);
  });

  it('revoke delegates to service', async () => {
    await controller.revoke('sally_abc', adminReq);
    expect(clientsService.revoke).toHaveBeenCalledWith('sally_abc', 10);
  });

  it('rotateSecret delegates to service', async () => {
    await controller.rotateSecret('sally_abc', adminReq);
    expect(clientsService.rotateSecret).toHaveBeenCalledWith('sally_abc', 10);
  });

  it('pause / resume / revokeViaAction / updateScopes delegate with tenantId', async () => {
    await controller.pause('sally_abc', adminReq);
    await controller.resume('sally_abc', adminReq);
    await controller.revokeViaAction('sally_abc', adminReq);
    await controller.updateScopes('sally_abc', { scopes: ['fleet:read'] } as any, adminReq);
    expect(clientsService.pause).toHaveBeenCalledWith('sally_abc', 10);
    expect(clientsService.resume).toHaveBeenCalledWith('sally_abc', 10);
    expect(clientsService.revoke).toHaveBeenCalledWith('sally_abc', 10);
    expect(clientsService.updateScopes).toHaveBeenCalledWith(
      'sally_abc',
      10,
      expect.objectContaining({ scopes: ['fleet:read'] }),
    );
  });
});
