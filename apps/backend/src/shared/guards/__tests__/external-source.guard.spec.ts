import { ExecutionContext, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ExternalSourceGuard } from '../external-source.guard';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../test/mocks';

describe('ExternalSourceGuard', () => {
  let guard: ExternalSourceGuard;
  let reflector: Reflector;
  let prisma: ReturnType<typeof createMockPrisma>;

  const createMockContext = (params: Record<string, string> = {}, user?: Record<string, any>, handler?: () => void) => {
    const request = { params, user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler ?? (() => {}),
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ExternalSourceGuard,
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get(ExternalSourceGuard);
    reflector = module.get(Reflector);
  });

  it('should allow when no EXTERNAL_SOURCE_KEY metadata is set', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const ctx = createMockContext();

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow when resource has no externalSource (null)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue({
      driverId: 'drv-1',
      externalSource: null,
    });
    const ctx = createMockContext({ driver_id: 'drv-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when driver has externalSource', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue({
      driverId: 'drv-1',
      externalSource: 'samsara',
    });
    const ctx = createMockContext({ driver_id: 'drv-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Cannot modify driver from external source: samsara');
  });

  it('should throw ForbiddenException when vehicle has externalSource', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('vehicle');
    prisma.vehicle.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      externalSource: 'samsara',
    });
    const ctx = createMockContext({ vehicle_id: 'veh-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Cannot modify vehicle from external source: samsara');
  });

  it('should extract driver_id param correctly', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue({
      driverId: 'drv-1',
      externalSource: null,
    });
    const ctx = createMockContext({ driver_id: 'drv-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await guard.canActivate(ctx);

    expect(prisma.driver.findFirst).toHaveBeenCalledWith({
      where: { driverId: 'drv-1', tenantId: 1 },
    });
  });

  it('should extract vehicle_id param correctly', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('vehicle');
    prisma.vehicle.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      externalSource: null,
    });
    const ctx = createMockContext({ vehicle_id: 'veh-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await guard.canActivate(ctx);

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { vehicleId: 'veh-1', tenantId: 1 },
    });
  });

  it('should fall back to id param when specific param not present', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue({
      driverId: 'drv-1',
      externalSource: null,
    });
    const ctx = createMockContext({ id: 'drv-1' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await guard.canActivate(ctx);

    expect(prisma.driver.findFirst).toHaveBeenCalledWith({
      where: { driverId: 'drv-1', tenantId: 1 },
    });
  });

  it('should enforce tenant isolation when querying resource', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue({
      driverId: 'drv-1',
      externalSource: null,
    });
    const ctx = createMockContext({ driver_id: 'drv-1' }, { tenantDbId: 42 });

    await guard.canActivate(ctx);

    expect(prisma.driver.findFirst).toHaveBeenCalledWith({
      where: { driverId: 'drv-1', tenantId: 42 },
    });
  });

  it('should throw NotFoundException when resource does not exist', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    prisma.driver.findFirst.mockResolvedValue(null);
    const ctx = createMockContext({ driver_id: 'drv-nonexistent' }, { tenant: { id: 1 }, tenantDbId: 1 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when resourceId is missing', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    const ctx = createMockContext({}, { tenant: { id: 1 }, tenantDbId: 1 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Resource ID is required');
  });

  it('should throw BadRequestException when tenantId is missing', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('driver');
    const ctx = createMockContext({ driver_id: 'drv-1' }, {});

    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Tenant ID is required');
  });
});
