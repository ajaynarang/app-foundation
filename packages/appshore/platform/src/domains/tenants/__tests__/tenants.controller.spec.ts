import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { RejectTenantDto } from '../dto/reject-tenant.dto';
import { TenantListQueryDto } from '../dto/tenant-list-query.dto';
import { BadRequestException } from '@nestjs/common';
import { TenantsController } from '../tenants.controller';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: any;

  beforeEach(() => {
    service = {
      registerTenant: jest.fn().mockResolvedValue({ tenantId: 't_new' }),
      checkSubdomainAvailability: jest.fn().mockResolvedValue(true),
      getTenantBranding: jest.fn().mockResolvedValue({ logo: null }),
      listTenants: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      approveTenant: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      rejectTenant: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      suspendTenant: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      reactivateTenant: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      updateTenant: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      getTenantDetails: jest.fn().mockResolvedValue({ tenantId: 't_1' }),
      getMyOrganizationProfile: jest.fn().mockResolvedValue({ companyName: 'Acme', timezone: 'UTC' }),
      updateMyOrganizationProfile: jest.fn().mockResolvedValue({ companyName: 'Acme', timezone: 'America/Chicago' }),
    };
    // getTenantDbId() resolves the JWT tenantId string to the numeric DB id
    // via prisma.tenant.findUnique.
    const prisma = {
      user: { findUnique: jest.fn() },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 42 }) },
    };
    controller = new TenantsController(prisma as any, service, {
      get: jest.fn((key: string) => (key === 'multiTenancy.mode' ? 'multi' : true)),
    } as any);
  });

  describe('register', () => {
    it('should register without turnstile when no secret configured', async () => {
      delete process.env.TURNSTILE_SECRET_KEY;
      const dto = { companyName: 'TestCo' } as any;
      const result = await controller.register(dto);
      expect(service.registerTenant).toHaveBeenCalledWith(dto);
      expect(result.tenantId).toBe('t_new');
    });

    it('answers 400 naming turnstileToken when it is missing but the secret is configured', async () => {
      process.env.TURNSTILE_SECRET_KEY = 'secret_key';
      const dto = { companyName: 'TestCo' } as any;

      expect(await fieldErrorsOf(controller.register(dto))).toHaveProperty('turnstileToken');

      delete process.env.TURNSTILE_SECRET_KEY;
    });

    it('answers 400 naming turnstileToken when verification fails', async () => {
      process.env.TURNSTILE_SECRET_KEY = 'secret_key';
      const dto = { companyName: 'TestCo', turnstileToken: 'bad_token' } as any;

      // Mock fetch to return failed verification
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      }) as any;

      expect(await fieldErrorsOf(controller.register(dto))).toHaveProperty('turnstileToken');

      global.fetch = originalFetch;
      delete process.env.TURNSTILE_SECRET_KEY;
    });

    it('should allow registration when turnstile call fails (fail-open)', async () => {
      process.env.TURNSTILE_SECRET_KEY = 'secret_key';
      const dto = { companyName: 'TestCo', turnstileToken: 'token' } as any;

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await controller.register(dto);
      expect(result.tenantId).toBe('t_new');

      global.fetch = originalFetch;
      delete process.env.TURNSTILE_SECRET_KEY;
    });
  });

  describe('checkSubdomain', () => {
    it('should return availability', async () => {
      const result = await controller.checkSubdomain('my-company');
      expect(result.available).toBe(true);
      expect(service.checkSubdomainAvailability).toHaveBeenCalledWith('my-company');
    });
  });

  describe('getTenantBranding', () => {
    it('should return branding', async () => {
      await controller.getTenantBranding('my-company');
      expect(service.getTenantBranding).toHaveBeenCalledWith('my-company');
    });
  });

  describe('getAllTenants', () => {
    it('should delegate to service', async () => {
      const page = await controller.getAllTenants(
        await readQueryDto(TenantListQueryDto, { status: 'ACTIVE', q: ' acme ', limit: '10', cursor: 'abc' }),
      );
      expect(service.listTenants).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACTIVE', q: 'acme', limit: 10, cursor: 'abc' }),
      );
      expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
      await controller.getAllTenants(await readQueryDto(TenantListQueryDto, {}));
      expect(service.listTenants.mock.calls[1][0].status).toBeUndefined();
    });

    it('answers 400 naming limit when it is not a whole number, and refuses offset paging', async () => {
      expect(await fieldErrorsOf(readQueryDto(TenantListQueryDto, { limit: 'abc' }))).toHaveProperty('limit');
      expect(await fieldErrorsOf(readQueryDto(TenantListQueryDto, { offset: '10' }))).toHaveProperty('offset');
    });

    it('answers 400 naming status for an unknown one (it used to reach the database)', async () => {
      expect(await fieldErrorsOf(readQueryDto(TenantListQueryDto, { status: 'active' }))).toHaveProperty('status');
    });
  });

  describe('approveTenant', () => {
    it('should approve with user email', async () => {
      await controller.approveTenant('t_1', { email: 'admin@test.com' });
      expect(service.approveTenant).toHaveBeenCalledWith('t_1', 'admin@test.com');
    });
  });

  describe('rejectTenant', () => {
    it('should reject with reason', async () => {
      await controller.rejectTenant('t_1', await readBodyDto(RejectTenantDto, { reason: 'Fraud' }));
      expect(service.rejectTenant).toHaveBeenCalledWith('t_1', 'Fraud');
    });

    it('answers 400 naming reason when it is not text, and refuses an undeclared field', async () => {
      expect(await fieldErrorsOf(readBodyDto(RejectTenantDto, { reason: 42 }))).toHaveProperty('reason');
      expect(await fieldErrorsOf(readBodyDto(RejectTenantDto, { reason: 'x', status: 'ACTIVE' }))).toHaveProperty(
        'status',
      );
    });
  });

  describe('suspendTenant', () => {
    it('should suspend with reason and user', async () => {
      await controller.suspendTenant(
        't_1',
        { reason: 'Non-payment' },
        {
          email: 'admin@test.com',
        },
      );
      expect(service.suspendTenant).toHaveBeenCalledWith('t_1', 'Non-payment', 'admin@test.com');
    });
  });

  describe('reactivateTenant', () => {
    it('should reactivate with user', async () => {
      await controller.reactivateTenant('t_1', { email: 'admin@test.com' });
      expect(service.reactivateTenant).toHaveBeenCalledWith('t_1', 'admin@test.com');
    });
  });

  describe('updateTenant', () => {
    it('should update tenant', async () => {
      const dto = { companyName: 'New Name' };
      await controller.updateTenant('t_1', dto);
      expect(service.updateTenant).toHaveBeenCalledWith('t_1', dto);
    });
  });

  describe('getTenantDetails', () => {
    it('should get tenant details', async () => {
      await controller.getTenantDetails('t_1');
      expect(service.getTenantDetails).toHaveBeenCalledWith('t_1');
    });
  });

  describe('getMyOrganizationProfile', () => {
    it('resolves the numeric tenantDbId and delegates to the service', async () => {
      const result = await controller.getMyOrganizationProfile({ tenantId: 't_1' });
      expect(service.getMyOrganizationProfile).toHaveBeenCalledWith(42);
      expect(result.companyName).toBe('Acme');
    });
  });

  describe('updateMyOrganizationProfile', () => {
    it('resolves the numeric tenantDbId and passes the dto to the service', async () => {
      const dto = { companyName: 'Acme', timezone: 'America/Chicago' } as any;
      const result = await controller.updateMyOrganizationProfile({ tenantId: 't_1' }, dto);
      expect(service.updateMyOrganizationProfile).toHaveBeenCalledWith(42, dto);
      expect(result.timezone).toBe('America/Chicago');
    });
  });
});
