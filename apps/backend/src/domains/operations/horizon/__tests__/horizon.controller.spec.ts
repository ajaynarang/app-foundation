import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HorizonController } from '../horizon.controller';
import { HorizonService } from '../horizon.service';

describe('HorizonController', () => {
  let controller: HorizonController;

  const mockHorizonService = {
    getHorizon: jest.fn(),
  };

  const mockUser = {
    tenantDbId: 1,
    userId: 'user-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HorizonController],
      providers: [{ provide: HorizonService, useValue: mockHorizonService }],
    }).compile();

    controller = module.get<HorizonController>(HorizonController);
    jest.clearAllMocks();
  });

  describe('getHorizon', () => {
    it('should call service with tenantId and provided weekOf', async () => {
      const weekOf = '2026-04-07';
      mockHorizonService.getHorizon.mockResolvedValue({
        drivers: [],
        vehicles: [],
      });

      const result = await controller.getHorizon(mockUser, weekOf);

      expect(mockHorizonService.getHorizon).toHaveBeenCalledWith(1, weekOf);
      expect(result).toEqual({ drivers: [], vehicles: [] });
    });

    it('should default weekOf to current date when not provided', async () => {
      mockHorizonService.getHorizon.mockResolvedValue({ drivers: [] });

      await controller.getHorizon(mockUser);

      const calledWith = mockHorizonService.getHorizon.mock.calls[0];
      expect(calledWith[0]).toBe(1);
      // Should be a date string in YYYY-MM-DD format
      expect(calledWith[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      await expect(controller.getHorizon(mockUser, 'not-a-date')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date value', async () => {
      await expect(controller.getHorizon(mockUser, '2026-13-45')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for partial date format', async () => {
      await expect(controller.getHorizon(mockUser, '2026-04')).rejects.toThrow(BadRequestException);
    });

    it('should accept a valid date string', async () => {
      mockHorizonService.getHorizon.mockResolvedValue({ drivers: [] });

      await expect(controller.getHorizon(mockUser, '2026-02-28')).resolves.not.toThrow();
    });

    it('should propagate service errors', async () => {
      mockHorizonService.getHorizon.mockRejectedValue(new Error('DB error'));

      await expect(controller.getHorizon(mockUser, '2026-04-07')).rejects.toThrow('DB error');
    });
  });
});
