import { OAuthClientsController } from '../oauth-clients.controller';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { OAuthScopeSchema } from '@app/shared-types';
import { CreateOAuthClientDto, UpdateOAuthClientDto } from '../dto/oauth-client.dto';

describe('OAuthClientsController', () => {
  let controller: OAuthClientsController;
  let clientsService: any;

  const adminReq = { user: { role: 'ADMIN', dbId: 1, tenantDbId: 10 } } as any;
  const superAdminReq = {
    user: { role: 'SUPER_ADMIN', dbId: 2, tenantDbId: null },
  } as any;

  beforeEach(() => {
    clientsService = {
      create: jest.fn().mockResolvedValue({ clientId: 'app_new' }),
      findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      findByClientId: jest.fn().mockResolvedValue({ clientId: 'app_abc' }),
      update: jest.fn().mockResolvedValue({ clientId: 'app_abc' }),
      revoke: jest.fn().mockResolvedValue(undefined),
      rotateSecret: jest.fn().mockResolvedValue({ clientSecret: 'new-secret' }),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      updateScopes: jest.fn().mockResolvedValue({ clientId: 'app_abc' }),
    };
    controller = new OAuthClientsController(clientsService);
  });

  it('create uses tenant for ADMIN', async () => {
    await controller.create({ name: 'Test' } as any, adminReq);
    expect(clientsService.create).toHaveBeenCalledWith({ name: 'Test', clientType: 'confidential' }, 1, 10);
  });

  it('create uses null tenant for SUPER_ADMIN', async () => {
    await controller.create({ name: 'Test' } as any, superAdminReq);
    expect(clientsService.create).toHaveBeenCalledWith({ name: 'Test', clientType: 'confidential' }, 2, null);
  });

  it('findAll uses tenant for ADMIN', async () => {
    const page = await controller.findAll(adminReq, { limit: 10, cursor: 'abc' });
    expect(clientsService.findAll).toHaveBeenCalledWith(10, { limit: 10, cursor: 'abc' });
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('findAll uses null tenant for SUPER_ADMIN', async () => {
    await controller.findAll(superAdminReq, {});
    expect(clientsService.findAll).toHaveBeenCalledWith(null, {});
  });

  it('findOne delegates to service', async () => {
    await controller.findOne('app_abc', adminReq);
    expect(clientsService.findByClientId).toHaveBeenCalledWith('app_abc', 10);
  });

  it('update delegates to service', async () => {
    await controller.update('app_abc', { name: 'Updated' }, adminReq);
    expect(clientsService.update).toHaveBeenCalledWith('app_abc', { name: 'Updated' }, 10);
  });

  it('revoke delegates to service', async () => {
    await controller.revoke('app_abc', adminReq);
    expect(clientsService.revoke).toHaveBeenCalledWith('app_abc', 10);
  });

  it('rotateSecret delegates to service', async () => {
    await controller.rotateSecret('app_abc', adminReq);
    expect(clientsService.rotateSecret).toHaveBeenCalledWith('app_abc', 10);
  });

  it('pause / resume / revokeViaAction / updateScopes delegate with tenantId', async () => {
    await controller.pause('app_abc', adminReq);
    await controller.resume('app_abc', adminReq);
    await controller.revokeViaAction('app_abc', adminReq);
    await controller.updateScopes('app_abc', { scopes: ['platform:read'] } as any, adminReq);
    expect(clientsService.pause).toHaveBeenCalledWith('app_abc', 10);
    expect(clientsService.resume).toHaveBeenCalledWith('app_abc', 10);
    expect(clientsService.revoke).toHaveBeenCalledWith('app_abc', 10);
    expect(clientsService.updateScopes).toHaveBeenCalledWith(
      'app_abc',
      10,
      expect.objectContaining({ scopes: ['platform:read'] }),
    );
  });

  describe('request bodies', () => {
    const valid = {
      name: 'Release bot',
      redirectUris: ['https://bot.example.com/oauth/callback'],
      scopes: [OAuthScopeSchema.options[0]],
    };

    it('accepts a client the shared schema accepts', async () => {
      expect(await readBodyDto(CreateOAuthClientDto, { ...valid, clientType: 'public' })).toEqual({
        ...valid,
        clientType: 'public',
      });
    });

    it('answers 400 naming each bad field; the body was a type with no check before', async () => {
      expect(await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, name: '' }))).toHaveProperty('name');
      expect(await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, redirectUris: [] }))).toHaveProperty(
        'redirectUris',
      );
      const badUri = await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, redirectUris: ['not a url'] }));
      expect(Object.keys(badUri).some((field) => field.startsWith('redirectUris'))).toBe(true);
      const badScope = await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, scopes: ['root:all'] }));
      expect(Object.keys(badScope).some((field) => field.startsWith('scopes'))).toBe(true);
      expect(await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, clientType: 'secret' }))).toHaveProperty(
        'clientType',
      );
    });

    it('refuses a field the client may not set', async () => {
      expect(await fieldErrorsOf(readBodyDto(CreateOAuthClientDto, { ...valid, tenantId: 1 }))).toHaveProperty(
        'tenantId',
      );
      expect(await fieldErrorsOf(readBodyDto(UpdateOAuthClientDto, { isActive: true }))).toHaveProperty('isActive');
    });

    it('an update may carry any subset, under the same rules', async () => {
      expect(await readBodyDto(UpdateOAuthClientDto, { name: 'Updated' })).toEqual({ name: 'Updated' });
      expect(await fieldErrorsOf(readBodyDto(UpdateOAuthClientDto, { scopes: [] }))).toHaveProperty('scopes');
    });
  });
});
