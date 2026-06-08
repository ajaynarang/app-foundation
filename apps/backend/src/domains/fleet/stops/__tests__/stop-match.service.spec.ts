import { Test } from '@nestjs/testing';
import { LocationPrecision } from '@prisma/client';
import { StopMatchService } from '../stop-match.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const prisma = {
  stop: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('StopMatchService', () => {
  let svc: StopMatchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [StopMatchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(StopMatchService);
  });

  it('suggests a merge when incoming ROOFTOP matches an existing ROOFTOP within epsilon', async () => {
    prisma.stop.findFirst.mockResolvedValue({ id: 42, locationPrecision: LocationPrecision.ROOFTOP });

    await svc.suggestMerge(7, {
      id: 99,
      lat: 40.94,
      lon: -74.13,
      locationPrecision: LocationPrecision.ROOFTOP,
    });

    expect(prisma.stop.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { suggestedMergeStopId: 42 },
    });
  });

  it('does NOT suggest when incoming is CENTROID — never snap a vague point onto a precise dock', async () => {
    await svc.suggestMerge(7, {
      id: 99,
      lat: 40.94,
      lon: -74.13,
      locationPrecision: LocationPrecision.CENTROID,
    });

    expect(prisma.stop.findFirst).not.toHaveBeenCalled();
    expect(prisma.stop.update).not.toHaveBeenCalled();
  });

  it('does NOT suggest when no existing ROOFTOP stop is within epsilon', async () => {
    prisma.stop.findFirst.mockResolvedValue(null);

    await svc.suggestMerge(7, {
      id: 99,
      lat: 40.94,
      lon: -74.13,
      locationPrecision: LocationPrecision.ROOFTOP,
    });

    expect(prisma.stop.update).not.toHaveBeenCalled();
  });

  it('no-ops when the stop has no coordinates', async () => {
    await svc.suggestMerge(7, {
      id: 99,
      lat: null,
      lon: null,
      locationPrecision: LocationPrecision.UNKNOWN,
    });

    expect(prisma.stop.findFirst).not.toHaveBeenCalled();
  });

  it('scopes the proximity query to the tenant, active stops, ROOFTOP, and excludes self', async () => {
    prisma.stop.findFirst.mockResolvedValue(null);

    await svc.suggestMerge(7, {
      id: 99,
      lat: 40.94,
      lon: -74.13,
      locationPrecision: LocationPrecision.ROOFTOP,
    });

    const where = prisma.stop.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(7);
    expect(where.isActive).toBe(true);
    expect(where.id).toEqual({ not: 99 });
    expect(where.locationPrecision).toBe(LocationPrecision.ROOFTOP);
    expect(where.lat.gte).toBeLessThan(40.94);
    expect(where.lat.lte).toBeGreaterThan(40.94);
  });
});
