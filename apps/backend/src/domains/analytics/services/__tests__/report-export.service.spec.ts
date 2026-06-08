import { Test, TestingModule } from '@nestjs/testing';
import { ReportExportService } from '../report-export.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  invoiceSettings: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
};

describe('ReportExportService', () => {
  let service: ReportExportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportExportService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ReportExportService>(ReportExportService);
  });

  describe('exportCsv', () => {
    beforeEach(() => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue({
        companyLegalName: 'Acme Freight LLC',
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75001',
        phone: '555-1234',
        email: 'info@acme.com',
        mcNumber: 'MC-123',
        dotNumber: 'DOT-456',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyName: 'Acme' });
    });

    it('should export CSV with tenant header', async () => {
      const data = [
        { name: 'Load 1', revenue: 1500 },
        { name: 'Load 2', revenue: 2000 },
      ];

      const csv = await service.exportCsv(1, 'profitability', 'Profitability Report', data);

      expect(csv).toContain('Acme Freight LLC');
      expect(csv).toContain('MC# MC-123');
      expect(csv).toContain('name,revenue');
      expect(csv).toContain('Load 1,1500');
    });

    it('should handle empty data', async () => {
      const csv = await service.exportCsv(1, 'report', 'Empty Report', []);
      expect(csv).toContain('No data available');
    });

    it('should escape CSV injection characters', async () => {
      const data = [{ field: '=CMD()' }];
      const csv = await service.exportCsv(1, 'test', 'Test', data);
      expect(csv).toContain("'=CMD()");
    });

    it('should quote fields with commas', async () => {
      const data = [{ field: 'Dallas, TX' }];
      const csv = await service.exportCsv(1, 'test', 'Test', data);
      expect(csv).toContain('"Dallas, TX"');
    });

    it('should handle null and undefined values', async () => {
      const data = [{ a: null, b: undefined, c: 'ok' }];
      const csv = await service.exportCsv(1, 'test', 'Test', data);
      expect(csv).toContain(',,ok');
    });

    it('should escape double quotes in fields', async () => {
      const data = [{ field: 'He said "hello"' }];
      const csv = await service.exportCsv(1, 'test', 'Test', data);
      expect(csv).toContain('"He said ""hello"""');
    });

    it('should handle fields starting with +, -, @, tab, return', async () => {
      const data = [{ a: '+123' }, { a: '-456' }, { a: '@formula' }, { a: '\ttab' }, { a: '\rreturn' }];
      const csv = await service.exportCsv(1, 'test', 'Test', data);
      expect(csv).toContain("'+123");
      expect(csv).toContain("'-456");
      expect(csv).toContain("'@formula");
    });

    it('should fallback to tenant name when no settings', async () => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
      const csv = await service.exportCsv(1, 'test', 'Test', [{ a: 1 }]);
      expect(csv).toContain('Acme');
    });

    it('should include report title and date', async () => {
      const csv = await service.exportCsv(1, 'test', 'Custom Report', [{ x: 1 }]);
      expect(csv).toContain('Report: Custom Report');
      expect(csv).toContain('Generated:');
    });
  });

  describe('exportPdf', () => {
    beforeEach(() => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue({
        companyLegalName: 'Acme Freight LLC',
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75001',
        phone: '555-1234',
        email: 'info@acme.com',
        mcNumber: 'MC-123',
        dotNumber: 'DOT-456',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyName: 'Acme' });

      // Mock pdfmake
      jest.mock(
        'pdfmake/js/Printer',
        () => ({
          __esModule: true,
          default: jest.fn().mockImplementation(() => ({
            createPdfKitDocument: jest.fn().mockReturnValue({
              on: jest.fn().mockImplementation(function (this: any, event: string, cb: (...args: any[]) => any) {
                if (event === 'data') setTimeout(() => cb(Buffer.from('pdf')), 0);
                if (event === 'end') setTimeout(() => cb(), 5);
                return this;
              }),
              end: jest.fn(),
            }),
          })),
        }),
        { virtual: true },
      );
    });

    it('should generate PDF buffer', async () => {
      const data = [{ name: 'Load A', revenue: 150000 }];
      const columns = [
        { key: 'name', label: 'Name' },
        { key: 'revenue', label: 'Revenue', format: 'currency' },
      ];
      const buffer = await service.exportPdf(1, 'loads', 'Load Report', data, columns);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should handle percent and number formats', async () => {
      const data = [{ pct: 95.5, count: 1234 }];
      const columns = [
        { key: 'pct', label: 'On-Time %', format: 'percent' },
        { key: 'count', label: 'Count', format: 'number' },
      ];
      const buffer = await service.exportPdf(1, 'test', 'Test', data, columns);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });
});
