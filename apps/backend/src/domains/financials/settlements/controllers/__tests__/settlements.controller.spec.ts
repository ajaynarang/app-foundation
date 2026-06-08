import { Test, TestingModule } from '@nestjs/testing';
import { SettlementsController } from '../settlements.controller';
import { SettlementsService } from '../../services/settlements.service';
import { SettlementPdfService } from '../../services/settlement-pdf.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('SettlementsController', () => {
  let controller: SettlementsController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'ADMIN',
    driverId: 'DRV-1',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
  };

  const mockSettlementsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    calculate: jest.fn(),
    addDeduction: jest.fn(),
    removeDeduction: jest.fn(),
    approve: jest.fn(),
    markPaid: jest.fn(),
    voidSettlement: jest.fn(),
    updateNotes: jest.fn(),
    getSummary: jest.fn(),
    previewBatch: jest.fn(),
    batchCalculate: jest.fn(),
    batchApprove: jest.fn(),
    batchPay: jest.fn(),
    batchVoid: jest.fn(),
  };

  const mockPdfService = {
    generatePdf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettlementsService, useValue: mockSettlementsService },
        { provide: SettlementPdfService, useValue: mockPdfService },
      ],
    }).compile();

    controller = module.get<SettlementsController>(SettlementsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /calculate', () => {
    it('should calculate settlement', async () => {
      const dto = {
        driverId: 'DRV-1',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-15',
      } as any;
      mockSettlementsService.calculate.mockResolvedValue({
        settlementId: 'SET-1',
      });

      const result = await controller.calculate(mockUser, dto);
      expect(mockSettlementsService.calculate).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual({ settlementId: 'SET-1' });
    });
  });

  describe('GET /', () => {
    it('should list settlements with filters', async () => {
      mockSettlementsService.findAll.mockResolvedValue({ items: [], total: 0 });

      await controller.findAll(
        mockUser,
        'pending',
        'DRV-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '50',
        '0',
      );

      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'pending', driverId: 'DRV-1' }),
        { limit: 50, offset: 0 },
      );
    });
  });

  describe('GET /summary', () => {
    it('should return summary stats', async () => {
      mockSettlementsService.getSummary.mockResolvedValue({ total: 10 });

      await controller.getSummary(mockUser, '2026-01-01', '2026-01-31');
      expect(mockSettlementsService.getSummary).toHaveBeenCalledWith(1, {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });
    });
  });

  describe('GET /:settlement_id', () => {
    it('should return settlement detail', async () => {
      mockSettlementsService.findOne.mockResolvedValue({
        settlementId: 'SET-1',
      });

      await controller.findOne(mockUser, 'SET-1');
      expect(mockSettlementsService.findOne).toHaveBeenCalledWith(1, 'SET-1');
    });
  });

  describe('POST /:settlement_id/deductions', () => {
    it('should add deduction', async () => {
      const dto = { description: 'Fuel advance', amountCents: 5000 } as any;
      mockSettlementsService.addDeduction.mockResolvedValue({ id: 1 });

      await controller.addDeduction(mockUser, 'SET-1', dto);
      expect(mockSettlementsService.addDeduction).toHaveBeenCalledWith(1, 'SET-1', dto);
    });
  });

  describe('DELETE /:settlement_id/deductions/:deduction_id', () => {
    it('should remove deduction', async () => {
      mockSettlementsService.removeDeduction.mockResolvedValue({
        removed: true,
      });

      await controller.removeDeduction(mockUser, 'SET-1', '5');
      expect(mockSettlementsService.removeDeduction).toHaveBeenCalledWith(1, 'SET-1', 5);
    });
  });

  describe('POST /:settlement_id/approve', () => {
    it('should approve settlement', async () => {
      mockSettlementsService.approve.mockResolvedValue({ status: 'approved' });

      await controller.approve(mockUser, 'SET-1');
      expect(mockSettlementsService.approve).toHaveBeenCalledWith(1, 'SET-1', 'user-1');
    });
  });

  describe('POST /:settlement_id/pay', () => {
    it('should mark settlement paid', async () => {
      mockSettlementsService.markPaid.mockResolvedValue({ status: 'paid' });

      await controller.markPaid(mockUser, 'SET-1');
      expect(mockSettlementsService.markPaid).toHaveBeenCalledWith(1, 'SET-1');
    });
  });

  describe('POST /:settlement_id/void', () => {
    it('should void settlement', async () => {
      mockSettlementsService.voidSettlement.mockResolvedValue({
        status: 'voided',
      });

      await controller.voidSettlement(mockUser, 'SET-1');
      expect(mockSettlementsService.voidSettlement).toHaveBeenCalledWith(1, 'SET-1');
    });
  });

  describe('PUT /:settlement_id/notes', () => {
    it('should update notes', async () => {
      mockSettlementsService.updateNotes.mockResolvedValue({
        notes: 'Updated',
      });

      await controller.updateNotes(mockUser, 'SET-1', {
        notes: 'Updated',
      } as any);
      expect(mockSettlementsService.updateNotes).toHaveBeenCalledWith(1, 'SET-1', 'Updated');
    });
  });

  describe('Driver self-service endpoints', () => {
    it('GET /my-settlements should list driver own settlements', async () => {
      mockSettlementsService.findAll.mockResolvedValue({ items: [] });

      await controller.findMySettlements(mockUser, undefined, '50', '0');
      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        1,
        { status: undefined, driverId: 'DRV-1' },
        { limit: 50, offset: 0 },
      );
    });
  });

  describe('Batch operations', () => {
    it('POST /preview-batch should preview', async () => {
      const dto = { driverIds: ['DRV-1'] } as any;
      mockSettlementsService.previewBatch.mockResolvedValue({ previews: [] });

      await controller.previewBatch(mockUser, dto);
      expect(mockSettlementsService.previewBatch).toHaveBeenCalledWith(1, dto);
    });

    it('POST /batch-calculate should batch calculate', async () => {
      const dto = { driverIds: ['DRV-1'], periodStart: '2026-01-01' } as any;
      mockSettlementsService.batchCalculate.mockResolvedValue({ created: 1 });

      await controller.batchCalculate(mockUser, dto);
      expect(mockSettlementsService.batchCalculate).toHaveBeenCalledWith(1, dto);
    });

    it('POST /batch-approve should batch approve', async () => {
      mockSettlementsService.batchApprove.mockResolvedValue({ approved: 2 });

      await controller.batchApprove(mockUser, {
        settlementIds: ['SET-1', 'SET-2'],
      } as any);

      expect(mockSettlementsService.batchApprove).toHaveBeenCalledWith(1, ['SET-1', 'SET-2'], 'user-1');
    });

    it('POST /batch-pay should batch pay', async () => {
      mockSettlementsService.batchPay.mockResolvedValue({ paid: 2 });

      await controller.batchPay(mockUser, {
        settlementIds: ['SET-1', 'SET-2'],
      } as any);

      expect(mockSettlementsService.batchPay).toHaveBeenCalledWith(1, ['SET-1', 'SET-2']);
    });

    it('POST /batch-void should batch void', async () => {
      mockSettlementsService.batchVoid.mockResolvedValue({ voided: 1 });

      await controller.batchVoid(mockUser, {
        settlementIds: ['SET-1'],
      } as any);

      expect(mockSettlementsService.batchVoid).toHaveBeenCalledWith(1, ['SET-1']);
    });
  });

  describe('Driver self-service', () => {
    it('GET /my-settlements/:settlement_id should return own settlement detail', async () => {
      mockSettlementsService.findOne.mockResolvedValue({
        settlementId: 'SET-1',
        driver: { driverId: 'DRV-1' },
      });

      const result = await controller.findMySettlement(mockUser, 'SET-1');

      expect(mockSettlementsService.findOne).toHaveBeenCalledWith(1, 'SET-1');
      expect(result.settlementId).toBe('SET-1');
    });

    it('GET /my-settlements/:settlement_id should throw ForbiddenException if not own settlement', async () => {
      const driverUser = {
        ...mockUser,
        role: 'DRIVER',
        driverId: 'DRV-1',
      };
      mockSettlementsService.findOne.mockResolvedValue({
        settlementId: 'SET-1',
        driver: { driverId: 'DRV-OTHER' },
      });

      await expect(controller.findMySettlement(driverUser, 'SET-1')).rejects.toThrow();
    });

    it('GET /my-settlements with status filter', async () => {
      mockSettlementsService.findAll.mockResolvedValue({ items: [] });

      await controller.findMySettlements(mockUser, 'PAID', '10', '5');
      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        1,
        { status: 'PAID', driverId: 'DRV-1' },
        { limit: 10, offset: 5 },
      );
    });
  });

  describe('PDF endpoints', () => {
    it('GET /:settlement_id/pdf should download settlement PDF', async () => {
      const pdfBuffer = Buffer.from('pdf-data');
      mockSettlementsService.findOne.mockResolvedValue({
        settlementNumber: 'STL-2026-W10-DRIVER',
      });
      mockPdfService.generatePdf.mockResolvedValue(pdfBuffer);

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.downloadPdf(mockUser, 'SET-1', mockRes);

      expect(mockSettlementsService.findOne).toHaveBeenCalledWith(1, 'SET-1');
      expect(mockPdfService.generatePdf).toHaveBeenCalledWith(1, 'SET-1');
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="STL-2026-W10-DRIVER.pdf"',
        'Content-Length': pdfBuffer.length,
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('GET /:settlement_id/pdf/preview should preview PDF inline', async () => {
      const pdfBuffer = Buffer.from('pdf-content');
      mockPdfService.generatePdf.mockResolvedValue(pdfBuffer);

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.previewPdf(mockUser, 'SET-1', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': pdfBuffer.length,
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('GET /my-settlements/:settlement_id/pdf should download own settlement PDF', async () => {
      mockSettlementsService.findOne.mockResolvedValue({
        settlementNumber: 'STL-2026-W10-DRIVER',
        driver: { driverId: 'DRV-1' },
      });
      const pdfBuffer = Buffer.from('pdf-data');
      mockPdfService.generatePdf.mockResolvedValue(pdfBuffer);

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.downloadMySettlementPdf(mockUser, 'SET-1', mockRes);

      expect(mockPdfService.generatePdf).toHaveBeenCalledWith(1, 'SET-1');
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });
  });

  describe('findAll with all query params', () => {
    it('should pass all filter params', async () => {
      mockSettlementsService.findAll.mockResolvedValue({ items: [] });

      await controller.findAll(
        mockUser,
        'DRAFT',
        'DRV-1',
        'search term',
        '2026-01-01',
        '2026-01-31',
        'period',
        'desc',
        '25',
        '10',
      );

      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        1,
        {
          status: 'DRAFT',
          driverId: 'DRV-1',
          search: 'search term',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          sortBy: 'period',
          sortOrder: 'desc',
        },
        { limit: 25, offset: 10 },
      );
    });
  });
});
