import { ReferenceDataController } from '../reference-data.controller';

describe('ReferenceDataController', () => {
  let controller: ReferenceDataController;
  let service: any;

  const mockData = [
    { id: 1, category: 'equipment_type', code: 'DRY_VAN', label: 'Dry Van' },
    { id: 2, category: 'equipment_type', code: 'FLATBED', label: 'Flatbed' },
  ];

  beforeEach(() => {
    service = {
      getByCategories: jest.fn().mockResolvedValue(mockData),
    };
    controller = new ReferenceDataController(service);
  });

  describe('getReferenceData', () => {
    it('should parse comma-separated categories and delegate to service', async () => {
      const query = { category: 'equipment_type,vehicle_status' };

      const result = await controller.getReferenceData(query as any);

      expect(service.getByCategories).toHaveBeenCalledWith(['equipment_type', 'vehicle_status']);
      expect(result).toEqual(mockData);
    });

    it('should pass undefined when no category is provided', async () => {
      const query = {};

      await controller.getReferenceData(query as any);

      expect(service.getByCategories).toHaveBeenCalledWith(undefined);
    });

    it('should handle a single category', async () => {
      const query = { category: 'equipment_type' };

      await controller.getReferenceData(query as any);

      expect(service.getByCategories).toHaveBeenCalledWith(['equipment_type']);
    });

    it('should trim whitespace from category names', async () => {
      const query = { category: ' equipment_type , vehicle_status ' };

      await controller.getReferenceData(query as any);

      expect(service.getByCategories).toHaveBeenCalledWith(['equipment_type', 'vehicle_status']);
    });

    it('should handle empty string category as falsy', async () => {
      const query = { category: '' };

      await controller.getReferenceData(query as any);

      expect(service.getByCategories).toHaveBeenCalledWith(undefined);
    });
  });
});
