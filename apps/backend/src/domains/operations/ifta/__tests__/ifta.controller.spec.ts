import { Test } from '@nestjs/testing';
import { IftaController } from '../ifta.controller';
import { IftaService } from '../services/ifta.service';
import { IftaMileageService } from '../services/ifta-mileage.service';
import { IftaFuelService } from '../services/ifta-fuel.service';
import { IftaTaxRateService } from '../services/ifta-tax-rate.service';

describe('IftaController', () => {
  let controller: IftaController;
  let iftaService: any;
  let mileageService: any;
  let fuelService: any;
  let taxRateService: any;

  const mockUser = { tenantDbId: 1, dbId: 42 };

  beforeEach(async () => {
    iftaService = {
      getQuarters: jest.fn().mockResolvedValue([]),
      getQuarterDetail: jest.fn().mockResolvedValue({}),
      getQuarterSummary: jest.fn().mockResolvedValue({}),
      calculateQuarter: jest.fn().mockResolvedValue({}),
      updateFilingStatus: jest.fn().mockResolvedValue({}),
    };
    mileageService = {
      addManualMileage: jest.fn().mockResolvedValue({}),
      getMileageForQuarter: jest.fn().mockResolvedValue([]),
    };
    fuelService = {
      createFuelPurchase: jest.fn().mockResolvedValue({}),
      getFuelPurchases: jest.fn().mockResolvedValue([]),
      deleteFuelPurchase: jest.fn().mockResolvedValue(undefined),
    };
    taxRateService = {
      getAllRatesForQuarter: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      controllers: [IftaController],
      providers: [
        { provide: IftaService, useValue: iftaService },
        { provide: IftaMileageService, useValue: mileageService },
        { provide: IftaFuelService, useValue: fuelService },
        { provide: IftaTaxRateService, useValue: taxRateService },
      ],
    }).compile();

    controller = module.get(IftaController);
  });

  it('should get quarters', async () => {
    await controller.getQuarters(mockUser, {});
    expect(iftaService.getQuarters).toHaveBeenCalledWith(1, {
      year: undefined,
      status: undefined,
    });
  });

  it('should get quarter detail', async () => {
    await controller.getQuarterDetail(1, mockUser);
    expect(iftaService.getQuarterDetail).toHaveBeenCalledWith(1, 1);
  });

  it('should get quarter summary', async () => {
    await controller.getQuarterSummary(1, mockUser);
    expect(iftaService.getQuarterSummary).toHaveBeenCalledWith(1, 1);
  });

  it('should calculate quarter', async () => {
    await controller.calculateQuarter(1, mockUser);
    expect(iftaService.calculateQuarter).toHaveBeenCalledWith(1, 1);
  });

  it('should update filing status', async () => {
    const dto = { status: 'filed' } as any;
    await controller.updateFilingStatus(1, dto, mockUser);
    expect(iftaService.updateFilingStatus).toHaveBeenCalledWith(1, 1, dto, 42);
  });

  it('should add manual mileage', async () => {
    const dto = { state: 'TX', miles: 100 } as any;
    await controller.addManualMileage(dto, mockUser);
    expect(mileageService.addManualMileage).toHaveBeenCalledWith(1, dto);
  });

  it('should get quarter mileage', async () => {
    await controller.getQuarterMileage(1, mockUser);
    expect(mileageService.getMileageForQuarter).toHaveBeenCalledWith(1, 1);
  });

  it('should create fuel purchase', async () => {
    const dto = { state: 'TX', gallons: 50 } as any;
    await controller.createFuelPurchase(dto, mockUser);
    expect(fuelService.createFuelPurchase).toHaveBeenCalledWith(1, {
      ...dto,
      createdById: 42,
    });
  });

  it('should get quarter fuel', async () => {
    await controller.getQuarterFuel(1, mockUser);
    expect(fuelService.getFuelPurchases).toHaveBeenCalledWith(1, 1);
  });

  it('should delete fuel purchase', async () => {
    const result = await controller.deleteFuelPurchase(10, mockUser);
    expect(result).toEqual({ deleted: true });
  });

  it('should get tax rates with defaults', async () => {
    await controller.getTaxRates(mockUser);
    expect(taxRateService.getAllRatesForQuarter).toHaveBeenCalled();
  });

  it('should get tax rates with explicit year/quarter', async () => {
    await controller.getTaxRates(mockUser, '2025', '2');
    expect(taxRateService.getAllRatesForQuarter).toHaveBeenCalledWith(2025, 2);
  });
});
