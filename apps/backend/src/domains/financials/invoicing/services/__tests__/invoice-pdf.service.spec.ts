import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvoicePdfService } from '../invoice-pdf.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

// Mock pdfmake
jest.mock(
  'pdfmake/js/Printer',
  () => {
    return {
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        createPdfKitDocument: jest.fn().mockReturnValue({
          on: jest.fn().mockImplementation(function (this: any, event: string, cb: (...args: any[]) => any) {
            if (event === 'data') setTimeout(() => cb(Buffer.from('pdf-data')), 0);
            if (event === 'end') setTimeout(() => cb(), 5);
            return this;
          }),
          end: jest.fn(),
        }),
      })),
    };
  },
  { virtual: true },
);

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;
  let prisma: any;

  const mockInvoice = {
    invoiceNumber: 'INV-001',
    issueDate: new Date('2026-01-15'),
    dueDate: new Date('2026-02-15'),
    paymentTermsDays: 30,
    status: 'SENT',
    subtotalCents: 150000,
    adjustmentCents: 0,
    totalCents: 150000,
    paidCents: 0,
    balanceCents: 150000,
    customer: {
      companyName: 'Test Corp',
      billingAddress: '123 Main St',
      billingCity: 'Dallas',
      billingState: 'TX',
      billingZip: '75001',
      billingEmail: 'billing@test.com',
      address: null,
      city: null,
      state: null,
      contacts: [],
    },
    load: {
      loadNumber: 'LD-001',
      referenceNumber: 'REF-001',
      bolNumber: 'BOL-001',
      equipmentType: 'DRY_VAN',
      stops: [
        {
          stop: { city: 'Dallas', state: 'TX' },
          completedAt: null,
          arrivedAt: null,
          appointmentDate: '2026-01-15',
        },
        {
          stop: { city: 'Houston', state: 'TX' },
          completedAt: null,
          arrivedAt: null,
          appointmentDate: '2026-01-16',
        },
      ],
    },
    lineItems: [
      {
        type: 'LINEHAUL',
        description: 'Linehaul charge',
        quantity: 1,
        unitPriceCents: 150000,
        totalCents: 150000,
        sequenceOrder: 1,
      },
    ],
    payments: [],
  };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(mockInvoice) },
      invoiceSettings: {
        findUnique: jest.fn().mockResolvedValue({
          companyLegalName: 'Test LLC',
          mcNumber: 'MC123',
          dotNumber: 'DOT456',
          address: '100 Elm',
          city: 'Dallas',
          state: 'TX',
          zip: '75001',
          phone: '555-1234',
          email: 'info@test.com',
          remittanceInstructions: 'Wire to...',
          termsAndConditions: 'Net 30 terms',
        }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [InvoicePdfService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(InvoicePdfService);
  });

  it('should throw NotFoundException when invoice not found', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(service.generatePdf(1, 'inv-x')).rejects.toThrow(NotFoundException);
  });

  it('should generate PDF buffer', async () => {
    const buffer = await service.generatePdf(1, 'inv-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle invoice with no settings', async () => {
    prisma.invoiceSettings.findUnique.mockResolvedValue(null);
    const buffer = await service.generatePdf(1, 'inv-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle invoice with adjustments and payments', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...mockInvoice,
      adjustmentCents: -5000,
      paidCents: 50000,
      balanceCents: 95000,
    });
    const buffer = await service.generatePdf(1, 'inv-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle load with no stops', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...mockInvoice,
      load: { ...mockInvoice.load, stops: [] },
    });
    const buffer = await service.generatePdf(1, 'inv-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
