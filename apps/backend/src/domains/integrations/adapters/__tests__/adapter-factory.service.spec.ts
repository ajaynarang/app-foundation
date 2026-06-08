import { Test, TestingModule } from '@nestjs/testing';
import { AdapterFactoryService } from '../adapter-factory.service';
import { Project44TMSAdapter } from '../tms/project44-tms.adapter';
import { McLeodTMSAdapter } from '../tms/mcleod-tms.adapter';
import { SamsaraELDAdapter } from '../eld/samsara-eld.adapter';
import { QuickBooksAdapter } from '../../accounting/vendors/quickbooks/quickbooks.adapter';
import { DATLoadBoardAdapter } from '../../load-board/adapters/dat/dat-load-board.adapter';

describe('AdapterFactoryService', () => {
  let service: AdapterFactoryService;
  const mockP44 = { getVehicles: jest.fn() };
  const mockMcleod = { getVehicles: jest.fn() };
  const mockSamsara = { getVehicles: jest.fn() };
  const mockQB = { syncInvoice: jest.fn() };
  const mockDAT = { search: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterFactoryService,
        { provide: Project44TMSAdapter, useValue: mockP44 },
        { provide: McLeodTMSAdapter, useValue: mockMcleod },
        { provide: SamsaraELDAdapter, useValue: mockSamsara },
        { provide: QuickBooksAdapter, useValue: mockQB },
        { provide: DATLoadBoardAdapter, useValue: mockDAT },
      ],
    }).compile();

    service = module.get<AdapterFactoryService>(AdapterFactoryService);
  });

  describe('getTMSAdapter', () => {
    it('should return project44 adapter', () => {
      expect(service.getTMSAdapter('PROJECT44_TMS')).toBe(mockP44);
    });

    it('should return mcleod adapter', () => {
      expect(service.getTMSAdapter('MCLEOD_TMS')).toBe(mockMcleod);
    });

    it('should return mcleod adapter for TMW (similar API)', () => {
      expect(service.getTMSAdapter('TMW_TMS')).toBe(mockMcleod);
    });

    it('should return null for unknown vendor', () => {
      expect(service.getTMSAdapter('UNKNOWN')).toBeNull();
    });
  });

  describe('getELDAdapter', () => {
    it('should return samsara adapter', () => {
      expect(service.getELDAdapter('SAMSARA_ELD')).toBe(mockSamsara);
    });

    it('should return samsara adapter for MOTIVE (similar API)', () => {
      expect(service.getELDAdapter('MOTIVE_ELD')).toBe(mockSamsara);
    });

    it('should return null for unknown vendor', () => {
      expect(service.getELDAdapter('UNKNOWN')).toBeNull();
    });
  });

  describe('getAccountingAdapter', () => {
    it('should return quickbooks adapter', () => {
      expect(service.getAccountingAdapter('QUICKBOOKS')).toBe(mockQB);
    });

    it('should return null for unknown vendor', () => {
      expect(service.getAccountingAdapter('XERO')).toBeNull();
    });
  });

  describe('getLoadBoardAdapter', () => {
    it('should return DAT adapter', () => {
      expect(service.getLoadBoardAdapter('DAT_LOAD_BOARD')).toBe(mockDAT);
    });

    it('should return null for unknown vendor', () => {
      expect(service.getLoadBoardAdapter('UNKNOWN')).toBeNull();
    });
  });

  describe('isVendorSupported helpers', () => {
    it('should return true for supported TMS vendor', () => {
      expect(service.isTMSVendorSupported('PROJECT44_TMS')).toBe(true);
    });

    it('should return false for unsupported TMS vendor', () => {
      expect(service.isTMSVendorSupported('UNKNOWN')).toBe(false);
    });

    it('should return true for supported ELD vendor', () => {
      expect(service.isELDVendorSupported('SAMSARA_ELD')).toBe(true);
    });

    it('should return false for unsupported ELD vendor', () => {
      expect(service.isELDVendorSupported('UNKNOWN')).toBe(false);
    });

    it('should return true for supported accounting vendor', () => {
      expect(service.isAccountingVendorSupported('QUICKBOOKS')).toBe(true);
    });

    it('should return false for unsupported accounting vendor', () => {
      expect(service.isAccountingVendorSupported('XERO')).toBe(false);
    });

    it('should return true for supported load board vendor', () => {
      expect(service.isLoadBoardVendorSupported('DAT_LOAD_BOARD')).toBe(true);
    });

    it('should return false for unsupported load board vendor', () => {
      expect(service.isLoadBoardVendorSupported('UNKNOWN')).toBe(false);
    });
  });
});
