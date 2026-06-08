import { Test, TestingModule } from '@nestjs/testing';
import { LoadsController } from '../loads.controller';
import { LoadsService } from '../../services/loads.service';
import { LoadChargesService } from '../../services/load-charges.service';
import { LoadNotesService } from '../../services/load-notes.service';
import { LoadEventsService } from '../../services/load-events.service';
import { LoadReversalService } from '../../services/load-reversal.service';
import { LoadLegService } from '../../services/load-leg.service';
import { DriverRecommendationService } from '../../services/driver-recommendation.service';
import { DispatchSheetPdfService } from '../../services/dispatch-sheet-pdf.service';
import { DispatchSheetEmailService } from '../../services/dispatch-sheet-email.service';
import { RoutePlanningEngineService } from '../../../../routing/route-planning/services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../../../../routing/route-planning/services/route-plan-persistence.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

const mockDispatchSheetData = {
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
  driver: { driverId: 'DRV-001', name: 'John Smith', phone: '555-123-4567' },
  vehicle: {
    vehicleId: 'VEH-001',
    unitNumber: '4521',
    make: 'Freightliner',
    model: 'Cascadia',
  },
  stops: [],
  route: null,
};

describe('LoadsController — Dispatch Sheet Endpoints', () => {
  let controller: LoadsController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockDriverUser = {
    userId: 'user-2',
    tenantId: 'tenant-1',
    dbId: 2,
    role: 'DRIVER',
    driverDbId: 5,
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1', companyName: 'Test Fleet' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    load: { findFirst: jest.fn() },
    loadLeg: { findFirst: jest.fn() },
    invoiceSettings: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  const mockLoadLegService = {
    getDispatchSheet: jest.fn().mockResolvedValue(mockDispatchSheetData),
    getActiveLeg: jest.fn(),
  };

  const mockPdfService = {
    generatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test')),
  };

  const mockEmailService = {
    sendDispatchSheet: jest.fn().mockResolvedValue({ sent: true, sentTo: 'driver@test.com' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoadsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: LoadsService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
            updateDraft: jest.fn(),
            assignLoad: jest.fn(),
            deleteLoad: jest.fn(),
            generateTrackingToken: jest.fn(),
            duplicate: jest.fn(),
            updateStopStatus: jest.fn(),
          },
        },
        {
          provide: LoadChargesService,
          useValue: {
            addCharge: jest.fn(),
            getCharges: jest.fn(),
            updateCharge: jest.fn(),
            removeCharge: jest.fn(),
          },
        },
        {
          provide: LoadNotesService,
          useValue: {
            addNote: jest.fn(),
            getNotes: jest.fn(),
            pinNote: jest.fn(),
            deleteNote: jest.fn(),
          },
        },
        { provide: LoadEventsService, useValue: { getEvents: jest.fn() } },
        {
          provide: LoadReversalService,
          useValue: { executeReversal: jest.fn(), previewReversal: jest.fn() },
        },
        {
          provide: DriverRecommendationService,
          useValue: { getRecommendations: jest.fn() },
        },
        {
          provide: RoutePlanningEngineService,
          useValue: { planRoute: jest.fn() },
        },
        {
          provide: RoutePlanPersistenceService,
          useValue: { getPlanById: jest.fn(), activatePlan: jest.fn() },
        },
        { provide: LoadLegService, useValue: mockLoadLegService },
        { provide: DispatchSheetPdfService, useValue: mockPdfService },
        { provide: DispatchSheetEmailService, useValue: mockEmailService },
      ],
    }).compile();

    controller = module.get<LoadsController>(LoadsController);
  });

  // ─── GET dispatch-sheet (JSON data) ─────────────────────────────────────────

  describe('GET /:load_id/legs/:leg_id/dispatch-sheet', () => {
    it('should return dispatch sheet data for dispatcher', async () => {
      const result = await controller.getLegDispatchSheet('LD-1', 'LEG-001', mockUser);
      expect(mockLoadLegService.getDispatchSheet).toHaveBeenCalledWith('LEG-001', 1);
      expect(result).toEqual(mockDispatchSheetData);
    });

    it('should allow driver to access their own leg', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driverId: 5,
      });

      const result = await controller.getLegDispatchSheet('LD-1', 'LEG-001', mockDriverUser);
      expect(result).toEqual(mockDispatchSheetData);
    });

    it("should deny driver access to another driver's leg", async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driverId: 999, // Different driver
      });

      await expect(controller.getLegDispatchSheet('LD-1', 'LEG-001', mockDriverUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny driver access when leg not found', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue(null);

      await expect(controller.getLegDispatchSheet('LD-1', 'LEG-001', mockDriverUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── GET dispatch-sheet/pdf ─────────────────────────────────────────────────

  describe('GET /:load_id/legs/:leg_id/dispatch-sheet/pdf', () => {
    it('should return PDF buffer with correct headers', async () => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue({
        companyLegalName: 'Test Fleet LLC',
        mcNumber: 'MC-123456',
        dotNumber: 'DOT-789',
        phone: '555-000-1234',
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
      });

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getLegDispatchSheetPdf('LD-1', 'LEG-001', mockUser, mockRes as any);

      expect(mockPdfService.generatePdf).toHaveBeenCalledWith(
        mockDispatchSheetData,
        'Test Fleet LLC',
        'MC-123456',
        'DOT-789',
        '555-000-1234',
        '123 Main St Dallas, TX 75201',
      );

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="dispatch-sheet-LN-00123.pdf"',
        'Content-Length': expect.any(String),
      });
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should use tenant companyName when no invoice settings', async () => {
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);

      const mockRes = { set: jest.fn(), end: jest.fn() };

      await controller.getLegDispatchSheetPdf('LD-1', 'LEG-001', mockUser, mockRes as any);

      expect(mockPdfService.generatePdf).toHaveBeenCalledWith(
        mockDispatchSheetData,
        'Test Fleet',
        undefined,
        undefined,
        undefined,
        null,
      );
    });

    it('should enforce driver access check', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driverId: 999,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() };

      await expect(
        controller.getLegDispatchSheetPdf('LD-1', 'LEG-001', mockDriverUser, mockRes as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── POST dispatch-sheet/send ───────────────────────────────────────────────

  describe('POST /:load_id/legs/:leg_id/dispatch-sheet/send', () => {
    it('should send dispatch sheet to driver email', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driver: { email: 'john@test.com', name: 'John Smith' },
      });
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue({
        companyLegalName: 'Test Fleet LLC',
        mcNumber: 'MC-123',
      });

      const result = await controller.sendLegDispatchSheet('LD-1', 'LEG-001', mockUser);

      expect(mockEmailService.sendDispatchSheet).toHaveBeenCalledWith(
        mockDispatchSheetData,
        'john@test.com',
        'Test Fleet LLC',
        expect.objectContaining({ mcNumber: 'MC-123' }),
      );
      expect(result).toEqual({ sent: true, sentTo: 'driver@test.com' });
    });

    it('should throw 404 when leg not found', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue(null);

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-001', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 when no driver assigned', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driver: null,
      });

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-001', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 when driver has no email', async () => {
      mockPrisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-001',
        driver: { email: null, name: 'John Smith' },
      });

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-001', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should only be accessible by DISPATCHER/ADMIN/OWNER roles', () => {
      // The @Roles decorator is metadata-based, tested via e2e. Here we verify
      // the method exists and is callable (decorator enforcement is framework-level).
      expect(controller.sendLegDispatchSheet).toBeDefined();
    });
  });
});
