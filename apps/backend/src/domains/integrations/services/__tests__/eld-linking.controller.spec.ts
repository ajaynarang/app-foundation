import { Test, TestingModule } from '@nestjs/testing';
import { EldLinkingController } from '../eld-linking.controller';
import { EldLinkingService } from '../eld-linking.service';

describe('EldLinkingController', () => {
  let controller: EldLinkingController;
  let service: any;

  const mockReq = {
    user: { tenantDbId: 5 },
  };

  beforeEach(async () => {
    service = {
      linkDriver: jest.fn(),
      unlinkDriver: jest.fn(),
      linkVehicle: jest.fn(),
      unlinkVehicle: jest.fn(),
      listEldDrivers: jest.fn(),
      listEldVehicles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EldLinkingController],
      providers: [{ provide: EldLinkingService, useValue: service }],
    }).compile();

    controller = module.get<EldLinkingController>(EldLinkingController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('linkDriver', () => {
    it('should call linkDriver with tenantId, id, and eldId', async () => {
      const linkResult = {
        linked: true,
        eldName: 'John',
        eldId: 'eld-1',
        matchMethod: 'manual',
      };
      service.linkDriver.mockResolvedValue(linkResult);

      const result = await controller.linkDriver(42, { eldId: 'eld-1' }, mockReq);

      expect(result).toEqual(linkResult);
      expect(service.linkDriver).toHaveBeenCalledWith(5, 42, 'eld-1');
    });

    it('should pass undefined eldId for auto-linking', async () => {
      const linkResult = {
        linked: true,
        eldName: 'John',
        eldId: 'auto-1',
        matchMethod: 'phone',
      };
      service.linkDriver.mockResolvedValue(linkResult);

      const result = await controller.linkDriver(42, {}, mockReq);

      expect(result).toEqual(linkResult);
      expect(service.linkDriver).toHaveBeenCalledWith(5, 42, undefined);
    });
  });

  describe('unlinkDriver', () => {
    it('should call unlinkDriver and return success', async () => {
      service.unlinkDriver.mockResolvedValue(undefined);

      const result = await controller.unlinkDriver(42, mockReq);

      expect(result).toEqual({ success: true });
      expect(service.unlinkDriver).toHaveBeenCalledWith(5, 42);
    });
  });

  describe('linkVehicle', () => {
    it('should call linkVehicle with tenantId, id, and eldId', async () => {
      const linkResult = {
        linked: true,
        eldName: 'Truck-1',
        eldId: 'eld-v1',
        matchMethod: 'vin',
      };
      service.linkVehicle.mockResolvedValue(linkResult);

      const result = await controller.linkVehicle(10, { eldId: 'eld-v1' }, mockReq);

      expect(result).toEqual(linkResult);
      expect(service.linkVehicle).toHaveBeenCalledWith(5, 10, 'eld-v1');
    });

    it('should pass undefined eldId for auto-linking', async () => {
      const linkResult = {
        linked: false,
        candidates: [
          { eldId: 'c1', name: 'Truck-A', detail: 'VIN: ABC' },
          { eldId: 'c2', name: 'Truck-B', detail: 'VIN: DEF' },
        ],
      };
      service.linkVehicle.mockResolvedValue(linkResult);

      const result = await controller.linkVehicle(10, {}, mockReq);

      expect(result.linked).toBe(false);
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe('unlinkVehicle', () => {
    it('should call unlinkVehicle and return success', async () => {
      service.unlinkVehicle.mockResolvedValue(undefined);

      const result = await controller.unlinkVehicle(10, mockReq);

      expect(result).toEqual({ success: true });
      expect(service.unlinkVehicle).toHaveBeenCalledWith(5, 10);
    });
  });

  describe('listEldDrivers', () => {
    it('should return ELD drivers for tenant', async () => {
      const drivers = [
        { eldId: 'd1', name: 'John' },
        { eldId: 'd2', name: 'Jane' },
      ];
      service.listEldDrivers.mockResolvedValue(drivers);

      const result = await controller.listEldDrivers(mockReq);

      expect(result).toEqual(drivers);
      expect(service.listEldDrivers).toHaveBeenCalledWith(5);
    });
  });

  describe('listEldVehicles', () => {
    it('should return ELD vehicles for tenant', async () => {
      const vehicles = [{ eldId: 'v1', name: 'Truck-1' }];
      service.listEldVehicles.mockResolvedValue(vehicles);

      const result = await controller.listEldVehicles(mockReq);

      expect(result).toEqual(vehicles);
      expect(service.listEldVehicles).toHaveBeenCalledWith(5);
    });
  });
});
