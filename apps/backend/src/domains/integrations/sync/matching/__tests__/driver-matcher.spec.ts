import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DriverMatcher } from '../driver-matcher';

describe('DriverMatcher', () => {
  let matcher: DriverMatcher;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverMatcher,
        {
          provide: PrismaService,
          useValue: {
            driver: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    matcher = module.get<DriverMatcher>(DriverMatcher);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('matchByPhone', () => {
    it('should find driver by phone', async () => {
      const mockDriver = {
        id: 1,
        phone: '+19788856169',
        tenantId: 1,
      };

      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(mockDriver as any);

      const result = await matcher.matchByPhone(1, '+19788856169');

      expect(result).toEqual(mockDriver);
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          phone: '+19788856169',
        },
      });
    });

    it('should return null if no driver found', async () => {
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);

      const result = await matcher.matchByPhone(1, '+1234567890');

      expect(result).toBeNull();
    });
  });

  describe('matchByLicense', () => {
    it('should find driver by license number and state', async () => {
      const mockDriver = {
        id: 2,
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
        tenantId: 1,
      };

      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(mockDriver as any);

      const result = await matcher.matchByLicense(1, 'NHL14227039', 'NH');

      expect(result).toEqual(mockDriver);
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          licenseNumber: 'NHL14227039',
          licenseState: 'NH',
        },
      });
    });

    it('should return null if license state missing', async () => {
      const result = await matcher.matchByLicense(1, 'NHL14227039', '');

      expect(result).toBeNull();
    });
  });

  describe('match', () => {
    it('should prioritize phone matching over license', async () => {
      const mockDriver = {
        id: 1,
        phone: '+19788856169',
        tenantId: 1,
      };

      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(mockDriver as any);

      const result = await matcher.match(1, {
        phone: '+19788856169',
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
      });

      expect(result).toEqual(mockDriver);
      // Should only call phone match, not license
      expect(prisma.driver.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          phone: '+19788856169',
        },
      });
    });

    it('should fallback to license if phone not found', async () => {
      const mockDriver = {
        id: 2,
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
        tenantId: 1,
      };

      jest
        .spyOn(prisma.driver, 'findFirst')
        .mockResolvedValueOnce(null) // Phone not found
        .mockResolvedValueOnce(mockDriver as any); // License found

      const result = await matcher.match(1, {
        phone: '+1234567890',
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
      });

      expect(result).toEqual(mockDriver);
      expect(prisma.driver.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should return null if no match found', async () => {
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);

      const result = await matcher.match(1, {
        phone: '+1234567890',
        licenseNumber: 'UNKNOWN',
        licenseState: 'XX',
      });

      expect(result).toBeNull();
    });
  });
});
