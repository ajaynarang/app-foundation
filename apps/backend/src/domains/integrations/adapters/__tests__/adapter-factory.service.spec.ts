import { Test, TestingModule } from '@nestjs/testing';
import { AdapterFactoryService } from '../adapter-factory.service';

describe('AdapterFactoryService', () => {
  let service: AdapterFactoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdapterFactoryService],
    }).compile();

    service = module.get<AdapterFactoryService>(AdapterFactoryService);
  });

  describe('getAccountingAdapter', () => {
    it('should return null when no adapters are registered', () => {
      expect(service.getAccountingAdapter('QUICKBOOKS')).toBeNull();
    });

    it('should return null for unknown vendor', () => {
      expect(service.getAccountingAdapter('XERO')).toBeNull();
    });
  });

  describe('isAccountingVendorSupported', () => {
    it('should return false when no adapters are registered', () => {
      expect(service.isAccountingVendorSupported('QUICKBOOKS')).toBe(false);
    });
  });
});
