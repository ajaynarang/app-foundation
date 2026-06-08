import { Test, TestingModule } from '@nestjs/testing';
import { DispatchSheetEmailService } from '../dispatch-sheet-email.service';
import { DispatchSheetPdfService } from '../dispatch-sheet-pdf.service';
import type { DispatchSheetData } from '../dispatch-sheet-pdf.service';

const baseData: DispatchSheetData = {
  legId: 'LEG-001',
  legSequence: 1,
  totalLegs: 1,
  isFinalLeg: true,
  status: 'ASSIGNED',
  loadNumber: 'LN-00123',
  referenceNumber: 'REF-98765',
  customerName: 'ABC Logistics',
  commodityType: 'Electronics',
  weightLbs: 42000,
  requiredEquipmentType: 'DRY_VAN',
  specialRequirements: null,
  pieces: 24,
  hazmatClass: null,
  tempRange: null,
  driver: {
    driverId: 'DRV-001',
    name: 'John Smith',
    phone: '555-123-4567',
  },
  vehicle: {
    vehicleId: 'VEH-001',
    unitNumber: '4521',
    make: 'Freightliner',
    model: 'Cascadia',
  },
  stops: [],
  route: null,
};

const mockPdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');

describe('DispatchSheetEmailService', () => {
  let service: DispatchSheetEmailService;
  let pdfService: { generatePdf: jest.Mock };
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset env for each test
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    pdfService = {
      generatePdf: jest.fn().mockResolvedValue(mockPdfBuffer),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DispatchSheetEmailService, { provide: DispatchSheetPdfService, useValue: pdfService }],
    }).compile();

    service = module.get<DispatchSheetEmailService>(DispatchSheetEmailService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sendDispatchSheet()', () => {
    const driverEmail = 'driver@example.com';
    const companyName = 'Test Carrier LLC';
    const settings = {
      mcNumber: 'MC123456',
      dotNumber: 'DOT789',
      phone: '800-555-0000',
      replyToEmail: 'dispatch@carrier.com',
      address: '100 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
    };

    it('should call pdfService.generatePdf() with correct arguments', async () => {
      await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

      expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
      expect(pdfService.generatePdf).toHaveBeenCalledWith(
        baseData,
        companyName,
        settings.mcNumber,
        settings.dotNumber,
        settings.phone,
        expect.any(String), // companyAddress built from settings parts
      );
    });

    it('should build company address from settings parts', async () => {
      await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

      const addressArg = pdfService.generatePdf.mock.calls[0][5];
      expect(addressArg).toContain('100 Main St');
      expect(addressArg).toContain('Dallas, TX');
      expect(addressArg).toContain('75201');
    });

    it('should pass null company address when settings has no address fields', async () => {
      await service.sendDispatchSheet(baseData, driverEmail, companyName, {
        mcNumber: null,
        dotNumber: null,
        phone: null,
        replyToEmail: null,
        address: null,
        city: null,
        state: null,
        zip: null,
      });

      const addressArg = pdfService.generatePdf.mock.calls[0][5];
      expect(addressArg).toBeNull();
    });

    it('should pass null for optional fields when settings is null', async () => {
      await service.sendDispatchSheet(baseData, driverEmail, companyName, null);

      expect(pdfService.generatePdf).toHaveBeenCalledWith(baseData, companyName, undefined, undefined, undefined, null);
    });

    describe('when Resend is NOT configured', () => {
      it('should return { sent: false, sentTo: email }', async () => {
        const result = await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        expect(result).toEqual({ sent: false, sentTo: driverEmail });
      });

      it('should still call pdfService.generatePdf()', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
      });
    });

    describe('when Resend IS configured', () => {
      const mockSend = jest.fn().mockResolvedValue({ id: 'msg-123' });

      beforeEach(() => {
        // Set the private resendClient directly to avoid dynamic import issues
        (service as any).resendClient = { emails: { send: mockSend } };
      });

      afterEach(() => {
        mockSend.mockClear();
      });

      it('should return { sent: true, sentTo: email }', async () => {
        const result = await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        expect(result).toEqual({ sent: true, sentTo: driverEmail });
      });

      it('should send email with correct to address', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: driverEmail }));
      });

      it('should include load number in subject', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.subject).toContain('LN-00123');
      });

      it('should include company name in email HTML (escaped)', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, "O'Brien & Sons <LLC>", settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.html).toContain('O&#039;Brien &amp; Sons &lt;LLC&gt;');
      });

      it('should include load number in email HTML (escaped)', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.html).toContain('LN-00123');
      });

      it('should attach PDF with correct filename format', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.attachments).toEqual([
          {
            filename: 'dispatch-sheet-LN-00123.pdf',
            content: mockPdfBuffer,
          },
        ]);
      });

      it('should use replyTo from settings when available', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.replyTo).toBe('dispatch@carrier.com');
      });

      it('should not set replyTo when settings has null replyToEmail', async () => {
        await service.sendDispatchSheet(baseData, driverEmail, companyName, {
          ...settings,
          replyToEmail: null,
        });

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.replyTo).toBeUndefined();
      });

      it('should use default from address when EMAIL_FROM is not set', async () => {
        delete process.env.EMAIL_FROM;

        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.from).toBe('noreply@appshore.in');
      });

      it('should use EMAIL_FROM env when set', async () => {
        process.env.EMAIL_FROM = 'custom@carrier.com';

        await service.sendDispatchSheet(baseData, driverEmail, companyName, settings);

        const sentArgs = mockSend.mock.calls[0][0];
        expect(sentArgs.from).toBe('custom@carrier.com');
      });
    });
  });
});
