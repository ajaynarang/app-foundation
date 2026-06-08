import { Test, TestingModule } from '@nestjs/testing';
import { FuelCardsController } from '../fuel-cards.controller';
import { FuelCardsService } from '../fuel-cards.service';

describe('FuelCardsController', () => {
  let controller: FuelCardsController;
  let fuelCardsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    fuelCardsService = {
      getActiveCardTypes: jest.fn().mockResolvedValue([{ id: 'comdata', displayName: 'Comdata', isActive: true }]),
      getAllCardTypes: jest.fn().mockResolvedValue([
        { id: 'comdata', displayName: 'Comdata', isActive: true },
        { id: 'wex', displayName: 'WEX', isActive: false },
      ]),
      updateCardType: jest.fn().mockResolvedValue({
        id: 'comdata',
        displayName: 'Updated',
        isActive: true,
      }),
      getBrandAcceptanceMap: jest.fn().mockResolvedValue([
        {
          brand: 'Shell',
          cards: [{ fuelCardTypeId: 'comdata', displayName: 'Comdata' }],
        },
      ]),
      setBrandAcceptance: jest.fn().mockResolvedValue({
        brand: 'Shell',
        cards: [{ fuelCardTypeId: 'comdata', displayName: 'Comdata' }],
      }),
      deleteBrand: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FuelCardsController],
      providers: [{ provide: FuelCardsService, useValue: fuelCardsService }],
    }).compile();

    controller = module.get<FuelCardsController>(FuelCardsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getActiveCardTypes ─────────────────────────────────────────────────

  describe('GET /types (getActiveCardTypes)', () => {
    it('should return active card types', async () => {
      const result = await controller.getActiveCardTypes();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('comdata');
      expect(fuelCardsService.getActiveCardTypes).toHaveBeenCalled();
    });
  });

  // ─── getAllCardTypes ─────────────────────────────────────────────────────

  describe('GET /admin/types (getAllCardTypes)', () => {
    it('should return all card types (including inactive)', async () => {
      const result = await controller.getAllCardTypes();

      expect(result).toHaveLength(2);
      expect(fuelCardsService.getAllCardTypes).toHaveBeenCalled();
    });
  });

  // ─── updateCardType ─────────────────────────────────────────────────────

  describe('PUT /admin/types/:id (updateCardType)', () => {
    it('should update a card type', async () => {
      const body = { displayName: 'Updated', isActive: true };

      const result = await controller.updateCardType('comdata', body);

      expect(fuelCardsService.updateCardType).toHaveBeenCalledWith('comdata', body);
      expect(result.displayName).toBe('Updated');
    });

    it('should pass partial update body', async () => {
      const body = { isActive: false };

      await controller.updateCardType('wex', body);

      expect(fuelCardsService.updateCardType).toHaveBeenCalledWith('wex', {
        isActive: false,
      });
    });
  });

  // ─── getBrandAcceptanceMap ──────────────────────────────────────────────

  describe('GET /admin/brand-acceptance (getBrandAcceptanceMap)', () => {
    it('should return brand acceptance map', async () => {
      const result = await controller.getBrandAcceptanceMap();

      expect(result).toHaveLength(1);
      expect(result[0].brand).toBe('Shell');
      expect(fuelCardsService.getBrandAcceptanceMap).toHaveBeenCalled();
    });
  });

  // ─── setBrandAcceptance ─────────────────────────────────────────────────

  describe('POST /admin/brand-acceptance (setBrandAcceptance)', () => {
    it('should set brand acceptance with valid data', async () => {
      const body = { brand: 'Shell', fuelCardTypeIds: ['comdata', 'wex'] };

      const result = await controller.setBrandAcceptance(body);

      expect(fuelCardsService.setBrandAcceptance).toHaveBeenCalledWith('Shell', ['comdata', 'wex']);
      expect(result.brand).toBe('Shell');
    });
  });

  // ─── deleteBrand ────────────────────────────────────────────────────────

  describe('DELETE /admin/brand-acceptance/:brand (deleteBrand)', () => {
    it('should delete a brand', async () => {
      await controller.deleteBrand('Shell');

      expect(fuelCardsService.deleteBrand).toHaveBeenCalledWith('Shell');
    });

    it('should decode URI-encoded brand names', async () => {
      await controller.deleteBrand("Love's%20Travel%20Stop");

      expect(fuelCardsService.deleteBrand).toHaveBeenCalledWith("Love's Travel Stop");
    });
  });
});
