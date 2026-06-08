import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StopsController } from '../stops.controller';
import { StopsService } from '../stops.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('StopsController', () => {
  let controller: StopsController;
  let service: any;

  const mockUser = { tenantId: 'tenant-1' };

  beforeEach(async () => {
    service = {
      getRecent: jest.fn().mockResolvedValue([{ id: 1, name: 'Recent Stop' }]),
      search: jest.fn().mockResolvedValue([{ id: 2, name: 'Result Stop' }]),
      findOrCreate: jest.fn().mockResolvedValue({ stop: { id: 1, stopId: 'stop-1' }, isNew: true }),
      update: jest.fn().mockResolvedValue({
        id: 1,
        stopId: 'stop-1',
        name: 'Updated',
        address: '123',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75001',
        lat: 32.7,
        lon: -96.8,
        locationType: 'warehouse',
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [StopsController],
      providers: [
        { provide: StopsService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            tenant: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
          },
        },
      ],
    }).compile();

    controller = module.get(StopsController);
  });

  describe('list', () => {
    it('should return paginated stops', async () => {
      service.list = jest.fn().mockResolvedValue({
        items: [{ id: 1, name: 'Stop A' }],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      });

      const result = await controller.list(mockUser, {} as any);
      expect(service.list).toHaveBeenCalledWith(1, expect.any(Object));
      expect(result.total).toBe(1);
    });
  });

  describe('getById', () => {
    it('should return stop when found', async () => {
      service.getById = jest.fn().mockResolvedValue({
        id: 1,
        stopId: 'stop-1',
        name: 'Test Stop',
      });

      const result = await controller.getById(mockUser, 1);
      expect(service.getById).toHaveBeenCalledWith(1, 1);
      expect(result.stopId).toBe('stop-1');
    });

    it('should throw NotFoundException when stop not found', async () => {
      service.getById = jest.fn().mockResolvedValue(null);

      await expect(controller.getById(mockUser, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('should return recent and results when query provided', async () => {
      const result = await controller.search(mockUser, {
        q: 'warehouse',
      } as any);
      expect(result.recent).toHaveLength(1);
      expect(result.results).toHaveLength(1);
    });

    it('should return only recent when no query', async () => {
      const result = await controller.search(mockUser, {} as any);
      expect(result.recent).toHaveLength(1);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should create stop with isNew flag', async () => {
      const result = await controller.create(mockUser, {} as any);
      expect(result.isNew).toBe(true);
    });
  });

  describe('fromPlace', () => {
    it('resolves tenant and returns the stop with isNew flag', async () => {
      service.findOrCreateFromPlace = jest.fn().mockResolvedValue({ stop: { id: 7, stopId: 'stop-7' }, isNew: true });

      const body = {
        suggestion: { externalId: 'x', text: 'Walmart DC', provider: 'here', lat: 1, lon: 2 },
        overrideName: 'Walmart DC #6094',
      };
      const result = await controller.fromPlace(mockUser, body as any);

      expect(service.findOrCreateFromPlace).toHaveBeenCalledWith(1, body.suggestion, 'Walmart DC #6094');
      expect(result).toMatchObject({ id: 7, stopId: 'stop-7', isNew: true });
    });
  });

  describe('update', () => {
    it('should update and return formatted stop', async () => {
      const result = await controller.update(mockUser, 1, {} as any);
      expect(result.stopId).toBe('stop-1');
      expect(result.useCount).toBe(0);
    });

    it('should throw when stop not found', async () => {
      service.update.mockResolvedValue(null);
      await expect(controller.update(mockUser, 999, {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
