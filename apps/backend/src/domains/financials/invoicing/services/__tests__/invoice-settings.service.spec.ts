import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSettingsService } from '../invoice-settings.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  invoiceSettings: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
};

describe('InvoiceSettingsService', () => {
  let service: InvoiceSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceSettingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<InvoiceSettingsService>(InvoiceSettingsService);
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const settings = {
        companyLegalName: 'ACME Corp',
        logoUrl: null,
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        phone: '555-1234',
        email: 'billing@acme.com',
        mcNumber: 'MC123',
        dotNumber: 'DOT456',
        defaultPaymentTermsDays: 30,
        remittanceInstructions: null,
        acceptedPaymentMethods: null,
        defaultNotes: null,
        termsAndConditions: null,
        invoicePrefix: 'INV',
        replyToEmail: null,
        emailSubjectTemplate: null,
        emailBodyTemplate: null,
      };
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(settings);

      const result = await service.getSettings(1);

      expect(result.companyLegalName).toBe('ACME Corp');
      expect(result.defaultPaymentTermsDays).toBe(30);
    });

    it('should create default settings from tenant when none exist', async () => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        companyName: 'ACME Corp',
        dotNumber: 'DOT456',
        contactEmail: 'contact@acme.com',
        contactPhone: '555-1234',
      });
      mockPrisma.invoiceSettings.create.mockResolvedValue({
        companyLegalName: 'ACME Corp',
        dotNumber: 'DOT456',
        email: 'contact@acme.com',
        phone: '555-1234',
        logoUrl: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        mcNumber: null,
        defaultPaymentTermsDays: null,
        remittanceInstructions: null,
        acceptedPaymentMethods: null,
        defaultNotes: null,
        termsAndConditions: null,
        invoicePrefix: null,
        replyToEmail: null,
        emailSubjectTemplate: null,
        emailBodyTemplate: null,
      });

      const result = await service.getSettings(1);

      expect(mockPrisma.invoiceSettings.create).toHaveBeenCalled();
      expect(result.companyLegalName).toBe('ACME Corp');
    });

    it('should handle missing tenant gracefully', async () => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.invoiceSettings.create.mockResolvedValue({
        companyLegalName: null,
        dotNumber: null,
        email: null,
        phone: null,
        logoUrl: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        mcNumber: null,
        defaultPaymentTermsDays: null,
        remittanceInstructions: null,
        acceptedPaymentMethods: null,
        defaultNotes: null,
        termsAndConditions: null,
        invoicePrefix: null,
        replyToEmail: null,
        emailSubjectTemplate: null,
        emailBodyTemplate: null,
      });

      const result = await service.getSettings(1);
      expect(result.companyLegalName).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('should upsert settings and return formatted response', async () => {
      mockPrisma.invoiceSettings.upsert.mockResolvedValue({
        companyLegalName: 'Updated Corp',
        logoUrl: 'https://logo.png',
        address: '456 Oak Ave',
        city: 'Houston',
        state: 'TX',
        zip: '77001',
        phone: '555-5678',
        email: 'new@acme.com',
        mcNumber: 'MC789',
        dotNumber: 'DOT101',
        defaultPaymentTermsDays: 45,
        remittanceInstructions: 'Wire to...',
        acceptedPaymentMethods: ['check', 'wire'],
        defaultNotes: 'Thank you',
        termsAndConditions: 'Net 45',
        invoicePrefix: 'ACME',
        replyToEmail: 'reply@acme.com',
        emailSubjectTemplate: 'Invoice {{number}}',
        emailBodyTemplate: 'Please pay',
      });

      const result = await service.updateSettings(1, {
        companyLegalName: 'Updated Corp',
        defaultPaymentTermsDays: 45,
      });

      expect(result.companyLegalName).toBe('Updated Corp');
      expect(result.defaultPaymentTermsDays).toBe(45);
      expect(mockPrisma.invoiceSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
        }),
      );
    });
  });
});
