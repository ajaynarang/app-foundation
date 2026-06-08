import { Test, TestingModule } from '@nestjs/testing';
import { LoadsController } from '../loads.controller';
import { LoadsService } from '../../services/loads.service';
import { LoadChargesService } from '../../services/load-charges.service';
import { LoadNotesService } from '../../services/load-notes.service';
import { LoadEventsService } from '../../services/load-events.service';
import { LoadReversalService } from '../../services/load-reversal.service';
import { DriverRecommendationService } from '../../services/driver-recommendation.service';
import { RoutePlanningEngineService } from '../../../../routing/route-planning/services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../../../../routing/route-planning/services/route-plan-persistence.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { LoadLegService } from '../../services/load-leg.service';
import { DispatchSheetPdfService } from '../../services/dispatch-sheet-pdf.service';
import { DispatchSheetEmailService } from '../../services/dispatch-sheet-email.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('LoadsController', () => {
  let controller: LoadsController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    load: { findFirst: jest.fn() },
    loadLeg: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    invoiceSettings: { findUnique: jest.fn() },
  };

  const mockLoadsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    updateDraft: jest.fn(),
    assignLoad: jest.fn(),
    deleteLoad: jest.fn(),
    generateTrackingToken: jest.fn(),
    duplicate: jest.fn(),
    updateStopStatus: jest.fn(),
    assignAllLegs: jest.fn(),
  };

  const mockLoadChargesService = {
    addCharge: jest.fn(),
    getCharges: jest.fn(),
    updateCharge: jest.fn(),
    removeCharge: jest.fn(),
  };

  const mockLoadNotesService = {
    addNote: jest.fn(),
    getNotes: jest.fn(),
    pinNote: jest.fn(),
    deleteNote: jest.fn(),
  };

  const mockLoadEventsService = {
    getEvents: jest.fn(),
  };

  const mockLoadReversalService = {
    executeReversal: jest.fn(),
    previewReversal: jest.fn(),
  };

  const mockDriverRecommendationService = {
    getRecommendations: jest.fn(),
  };

  const mockRoutePlanningEngine = {
    planRoute: jest.fn(),
  };

  const mockRoutePlanPersistence = {
    getPlanById: jest.fn(),
    activatePlan: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoadsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoadsService, useValue: mockLoadsService },
        { provide: LoadChargesService, useValue: mockLoadChargesService },
        { provide: LoadNotesService, useValue: mockLoadNotesService },
        { provide: LoadEventsService, useValue: mockLoadEventsService },
        { provide: LoadReversalService, useValue: mockLoadReversalService },
        {
          provide: DriverRecommendationService,
          useValue: mockDriverRecommendationService,
        },
        {
          provide: RoutePlanningEngineService,
          useValue: mockRoutePlanningEngine,
        },
        {
          provide: RoutePlanPersistenceService,
          useValue: mockRoutePlanPersistence,
        },
        {
          provide: LoadLegService,
          useValue: {
            getActiveLeg: jest.fn(),
            getDispatchSheetForLoad: jest.fn(),
            createLegsFromExchangePoints: jest.fn(),
            assignLeg: jest.fn(),
            advanceLegStatus: jest.fn(),
            getLegsForLoad: jest.fn(),
            getDispatchSheet: jest.fn(),
          },
        },
        {
          provide: DispatchSheetPdfService,
          useValue: { generatePdf: jest.fn() },
        },
        {
          provide: DispatchSheetEmailService,
          useValue: { sendDispatchSheet: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<LoadsController>(LoadsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST / (createLoad)', () => {
    it('should call loadsService.create with tenantId', async () => {
      const dto = { customerName: 'Acme', stops: [] } as any;
      const created = { loadId: 'LD-1', loadNumber: 'L001' };
      mockLoadsService.create.mockResolvedValue(created);

      const result = await controller.createLoad(mockUser, dto);

      expect(mockLoadsService.create).toHaveBeenCalledWith({
        ...dto,
        tenantId: 1,
      });
      expect(result).toEqual(created);
    });
  });

  describe('GET / (listLoads)', () => {
    it('should call loadsService.findAll with filters and pagination', async () => {
      const expected = { items: [], total: 0 };
      mockLoadsService.findAll.mockResolvedValue(expected);

      const result = await controller.listLoads(
        mockUser,
        'PENDING',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        50,
        0,
      );

      expect(mockLoadsService.findAll).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'PENDING' }), {
        limit: 50,
        offset: 0,
      });
      expect(result).toEqual(expected);
    });

    it('should force driverId filter for DRIVER role', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverId: 'DRV-1' };
      mockLoadsService.findAll.mockResolvedValue({ items: [], total: 0 });

      await controller.listLoads(
        driverUser,
        undefined,
        undefined,
        'DRV-OTHER',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        50,
        0,
      );

      expect(mockLoadsService.findAll).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ driverId: 'DRV-1' }),
        expect.any(Object),
      );
    });
  });

  describe('GET /:load_id (getLoad)', () => {
    it('should return load details', async () => {
      const load = { loadId: 'LD-1', status: 'PENDING' };
      mockPrisma.load.findFirst.mockResolvedValue({ driverId: null });
      mockLoadsService.findOne.mockResolvedValue(load);

      const result = await controller.getLoad(mockUser, 'LD-1');
      expect(mockLoadsService.findOne).toHaveBeenCalledWith('LD-1', 1);
      expect(result).toEqual(load);
    });

    it('should check driver access for DRIVER role', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      mockPrisma.load.findFirst.mockResolvedValue({ driverId: 999 });

      await expect(controller.getLoad(driverUser, 'LD-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('PATCH /:load_id/status (updateLoadStatus)', () => {
    it('should call updateStatus with correct args', async () => {
      mockLoadsService.updateStatus.mockResolvedValue({ status: 'IN_TRANSIT' });

      await controller.updateLoadStatus('LD-1', { status: 'IN_TRANSIT' });
      expect(mockLoadsService.updateStatus).toHaveBeenCalledWith('LD-1', 'IN_TRANSIT', { reason: undefined });
    });
  });

  describe('PATCH /:load_id (updateDraftLoad)', () => {
    it('should call updateDraft', async () => {
      const dto = { customerName: 'Updated' } as any;
      mockLoadsService.updateDraft.mockResolvedValue({ loadId: 'LD-1' });

      await controller.updateDraftLoad('LD-1', dto);
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('LD-1', dto);
    });
  });

  describe('POST /:load_id/assign (assignLoad)', () => {
    it('should call assignLoad with driverId and vehicleId', async () => {
      mockLoadsService.assignLoad.mockResolvedValue({ status: 'ASSIGNED' });

      await controller.assignLoad('LD-1', {
        driverId: 'DRV-1',
        vehicleId: 'VEH-1',
      });

      expect(mockLoadsService.assignLoad).toHaveBeenCalledWith('LD-1', 'DRV-1', 'VEH-1', undefined);
    });
  });

  describe('DELETE /:load_id (deleteLoad)', () => {
    it('should call deleteLoad with tenantId', async () => {
      mockLoadsService.deleteLoad.mockResolvedValue({ deleted: true });

      await controller.deleteLoad('LD-1', mockUser);
      expect(mockLoadsService.deleteLoad).toHaveBeenCalledWith('LD-1', 1);
    });
  });

  describe('POST /:load_id/duplicate (duplicateLoad)', () => {
    it('should call duplicate', async () => {
      mockLoadsService.duplicate.mockResolvedValue({ loadId: 'LD-2' });

      const result = await controller.duplicateLoad(mockUser, 'LD-1');
      expect(mockLoadsService.duplicate).toHaveBeenCalledWith('LD-1', 1);
      expect(result).toEqual({ loadId: 'LD-2' });
    });
  });

  describe('POST /:load_id/tracking-token', () => {
    it('should call generateTrackingToken with tenantDbId and userDbId', async () => {
      mockLoadsService.generateTrackingToken.mockResolvedValue({
        trackingToken: 'abc',
        trackingUrl: '/track/abc',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 42 });

      await controller.generateTrackingToken('LD-1', mockUser);

      expect(mockLoadsService.generateTrackingToken).toHaveBeenCalledWith('LD-1', 1, 42);
    });
  });

  describe('PATCH /:load_id/stops/:stop_id/status', () => {
    it('should call updateStopStatus', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ driverId: null });
      mockLoadsService.updateStopStatus.mockResolvedValue({
        status: 'ARRIVED',
      });

      await controller.updateStopStatus(mockUser, 'LD-1', '1', {
        status: 'ARRIVED',
      } as any);

      expect(mockLoadsService.updateStopStatus).toHaveBeenCalledWith('LD-1', 1, 'ARRIVED', 'user-1', 1);
    });
  });

  describe('POST /:load_id/revert', () => {
    it('should call executeReversal and return refreshed load', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 10, role: 'ADMIN' });
      mockLoadReversalService.executeReversal.mockResolvedValue(undefined);
      mockLoadsService.findOne.mockResolvedValue({
        loadNumber: 'LD-1',
        status: 'ASSIGNED',
      });

      const result = await controller.revertLoad(
        'LD-1',
        {
          targetStatus: 'ASSIGNED',
          category: 'dispatcher_correction',
          reason: 'Wrong status assignment',
        },
        mockUser,
      );

      expect(mockLoadReversalService.executeReversal).toHaveBeenCalledWith(
        1,
        'LD-1',
        'ASSIGNED',
        'dispatcher_correction',
        'Wrong status assignment',
        10,
        'ADMIN',
      );
      expect(result).toEqual({ loadNumber: 'LD-1', status: 'ASSIGNED' });
    });

    it('should throw BadRequestException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        controller.revertLoad(
          'LD-1',
          {
            targetStatus: 'PENDING',
            category: 'correction',
            reason: 'Fix it now please',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /:load_id/revert-preview', () => {
    it('should call previewReversal', async () => {
      mockLoadReversalService.previewReversal.mockResolvedValue({ impact: [] });

      await controller.previewReversal(mockUser, 'LD-1', 'ASSIGNED');

      expect(mockLoadReversalService.previewReversal).toHaveBeenCalledWith(1, 'LD-1', 'ASSIGNED');
    });

    it('should throw on invalid targetStatus', async () => {
      await expect(controller.previewReversal(mockUser, 'LD-1', 'invalid')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Charges endpoints', () => {
    it('POST /:load_id/charges should add charge', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.addCharge.mockResolvedValue({ id: 1 });

      await controller.addCharge(mockUser, 'LD-1', {
        chargeType: 'accessorial',
        description: 'Detention',
        quantity: 1,
        unitPriceCents: 5000,
        isBillable: true,
        isPayable: false,
      } as any);

      expect(mockLoadChargesService.addCharge).toHaveBeenCalledWith(
        expect.objectContaining({ loadId: 10, chargeType: 'accessorial' }),
      );
    });

    it('GET /:load_id/charges should return charges', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.getCharges.mockResolvedValue([{ id: 1 }]);

      const result = await controller.getCharges(mockUser, 'LD-1');
      expect(mockLoadChargesService.getCharges).toHaveBeenCalledWith(10);
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe('Notes endpoints', () => {
    it('POST /:load_id/notes should add note', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.addNote.mockResolvedValue({ id: 1 });

      await controller.addNote(mockUser, 'LD-1', {
        content: 'Test note',
        noteType: 'general',
      } as any);

      expect(mockLoadNotesService.addNote).toHaveBeenCalledWith(
        expect.objectContaining({ loadId: 10, content: 'Test note' }),
      );
    });
  });

  describe('GET /:load_id/activity', () => {
    it('should merge events and notes sorted by date desc', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadEventsService.getEvents.mockResolvedValue([
        {
          id: 1,
          eventType: 'status_change',
          fromValue: 'PENDING',
          toValue: 'ASSIGNED',
          description: null,
          userId: null,
          metadata: null,
          createdAt: new Date('2026-01-02'),
        },
      ]);
      mockLoadNotesService.getNotes.mockResolvedValue([
        {
          id: 2,
          content: 'Note',
          noteType: 'general',
          isPinned: false,
          userId: null,
          createdAt: new Date('2026-01-03'),
        },
      ]);

      const result = await controller.getActivity(mockUser, 'LD-1');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('note');
      expect(result[1].type).toBe('event');
    });
  });

  describe('GET /:load_id/driver-recommendations', () => {
    it('should return recommendations', async () => {
      mockDriverRecommendationService.getRecommendations.mockResolvedValue([{ driverId: 'DRV-1', score: 0.9 }]);

      const result = await controller.getDriverRecommendations(mockUser, 'LD-1');

      expect(result).toEqual({
        recommendations: [{ driverId: 'DRV-1', score: 0.9 }],
      });
    });
  });

  describe('GET /:load_id/stops (getStops)', () => {
    it('should return stops for a load', async () => {
      const stops = [{ id: 1, name: 'Stop A' }];
      mockPrisma.load.findFirst.mockResolvedValue({ driverId: null });
      mockLoadsService.findOne.mockResolvedValue({ id: 10, stops });

      const result = await controller.getStops(mockUser, 'LD-1');

      expect(mockLoadsService.findOne).toHaveBeenCalledWith('LD-1', 1);
      expect(result).toEqual(stops);
    });
  });

  describe('PATCH /:load_id/charges/:charge_id (updateCharge)', () => {
    it('should update a charge that belongs to the load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.getCharges.mockResolvedValue([{ id: 5, chargeType: 'accessorial' }]);
      mockLoadChargesService.updateCharge.mockResolvedValue({ id: 5 });

      await controller.updateCharge(mockUser, 'LD-1', '5', {
        description: 'Updated',
        unitPriceCents: 6000,
      } as any);

      expect(mockLoadChargesService.updateCharge).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ description: 'Updated' }),
      );
    });

    it('should throw NotFoundException if charge not on load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.getCharges.mockResolvedValue([{ id: 99 }]);

      await expect(controller.updateCharge(mockUser, 'LD-1', '5', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /:load_id/charges/:charge_id (removeCharge)', () => {
    it('should remove a charge that belongs to the load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.getCharges.mockResolvedValue([{ id: 5 }]);
      mockLoadChargesService.removeCharge.mockResolvedValue({ deleted: true });

      await controller.removeCharge(mockUser, 'LD-1', '5');

      expect(mockLoadChargesService.removeCharge).toHaveBeenCalledWith(5);
    });

    it('should throw NotFoundException if charge not on load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadChargesService.getCharges.mockResolvedValue([{ id: 99 }]);

      await expect(controller.removeCharge(mockUser, 'LD-1', '5')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /:load_id/notes (getNotes)', () => {
    it('should return notes for a load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.getNotes.mockResolvedValue([{ id: 1, content: 'Hi' }]);

      const result = await controller.getNotes(mockUser, 'LD-1');
      expect(mockLoadNotesService.getNotes).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
    });
  });

  describe('PATCH /:load_id/notes/:note_id (pinNote)', () => {
    it('should pin a note that belongs to the load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.getNotes.mockResolvedValue([{ id: 7 }]);
      mockLoadNotesService.pinNote.mockResolvedValue({ id: 7, isPinned: true });

      await controller.pinNote(mockUser, 'LD-1', '7');
      expect(mockLoadNotesService.pinNote).toHaveBeenCalledWith(7);
    });

    it('should throw NotFoundException if note not on load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.getNotes.mockResolvedValue([{ id: 99 }]);

      await expect(controller.pinNote(mockUser, 'LD-1', '7')).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /:load_id/notes/:note_id (deleteNote)', () => {
    it('should delete a note that belongs to the load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.getNotes.mockResolvedValue([{ id: 7 }]);
      mockLoadNotesService.deleteNote.mockResolvedValue({ deleted: true });

      await controller.deleteNote(mockUser, 'LD-1', '7');
      expect(mockLoadNotesService.deleteNote).toHaveBeenCalledWith(7);
    });

    it('should throw NotFoundException if note not on load', async () => {
      mockLoadsService.findOne.mockResolvedValue({ id: 10 });
      mockLoadNotesService.getNotes.mockResolvedValue([{ id: 99 }]);

      await expect(controller.deleteNote(mockUser, 'LD-1', '7')).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /:load_id/generate-route', () => {
    it('should generate a route plan', async () => {
      const plan = { planId: 'PLAN-1' };
      mockRoutePlanningEngine.planRoute.mockResolvedValue(plan);

      const dto = {
        driverId: 'DRV-1',
        vehicleId: 'VEH-1',
        departureTime: '2026-04-10T08:00:00Z',
        optimizationPriority: 'time',
      } as any;

      const result = await controller.generateRoute(mockUser, 'LD-1', dto);

      expect(mockRoutePlanningEngine.planRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'DRV-1',
          vehicleId: 'VEH-1',
          loadIds: ['LD-1'],
          tenantId: 1,
        }),
      );
      expect(result).toEqual(plan);
    });
  });

  describe('POST /:load_id/assign-with-route', () => {
    it('should activate a route plan and assign load', async () => {
      mockRoutePlanPersistence.getPlanById.mockResolvedValue({
        tenantId: 1,
        loads: [{ load: { loadNumber: 'LD-1' } }],
      });
      mockRoutePlanPersistence.activatePlan.mockResolvedValue({
        status: 'active',
      });

      const result = await controller.assignWithRoute(mockUser, 'LD-1', {
        planId: 'PLAN-1',
      });

      expect(mockRoutePlanPersistence.activatePlan).toHaveBeenCalledWith('PLAN-1');
      expect(result.status).toBe('active');
    });

    it('should throw BadRequestException if plan does not include load', async () => {
      mockRoutePlanPersistence.getPlanById.mockResolvedValue({
        tenantId: 1,
        loads: [{ load: { loadNumber: 'LD-OTHER' } }],
      });

      await expect(controller.assignWithRoute(mockUser, 'LD-1', { planId: 'PLAN-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('GET /:load_id/dispatch-sheet/pdf (load-level)', () => {
    it('should generate and return PDF for dispatcher', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      const mockDispatchPdf = controller['dispatchSheetPdfService'] as any;
      mockLoadLeg.getDispatchSheetForLoad.mockResolvedValue({
        loadNumber: 'L001',
      });
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
      // Second call to tenant.findUnique for resolveCompanyInfo
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(mockTenant) // getTenantDbId
        .mockResolvedValueOnce({ companyName: 'ACME Trucking' }); // resolveCompanyInfo
      mockDispatchPdf.generatePdf.mockResolvedValue(Buffer.from('pdf-data'));

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as any;

      await controller.getLoadDispatchSheetPdf('LD-1', mockUser, mockRes);

      expect(mockLoadLeg.getDispatchSheetForLoad).toHaveBeenCalledWith('LD-1', 1);
      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('POST /:load_id/dispatch-sheet/send (load-level)', () => {
    it('should send dispatch sheet email', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      const mockDispatchEmail = controller['dispatchSheetEmailService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({
        driver: { email: 'john@example.com', name: 'John' },
      });
      mockLoadLeg.getDispatchSheetForLoad.mockResolvedValue({
        loadNumber: 'L001',
      });
      mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(mockTenant) // getTenantDbId
        .mockResolvedValueOnce({ companyName: 'ACME' }); // resolveCompanyInfo
      mockDispatchEmail.sendDispatchSheet.mockResolvedValue({ sent: true });

      const result = await controller.sendLoadDispatchSheet('LD-1', mockUser);

      expect(mockDispatchEmail.sendDispatchSheet).toHaveBeenCalledWith(
        expect.objectContaining({ loadNumber: 'L001' }),
        'john@example.com',
        'ACME',
        null,
      );
      expect(result).toEqual({ sent: true });
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.sendLoadDispatchSheet('NOPE', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw if no driver assigned', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ driver: null });

      await expect(controller.sendLoadDispatchSheet('LD-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw if driver has no email', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        driver: { email: null, name: 'John' },
      });

      await expect(controller.sendLoadDispatchSheet('LD-1', mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /:load_id/driver-view', () => {
    const driverUser = {
      ...mockUser,
      role: 'DRIVER',
      driverDbId: 5,
    };

    it('should return driver-scoped legs for a relay load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'L001',
        status: 'IN_TRANSIT',
        isRelay: true,
        customerName: 'ACME',
        commodityType: 'General',
        weightLbs: 40000,
        equipmentType: 'DRY_VAN',
        requiredEquipmentType: null,
        specialRequirements: null,
      });
      mockPrisma.loadLeg.findMany.mockResolvedValue([
        {
          legId: 'LEG-1',
          sequence: 1,
          status: 'DELIVERED',
          driverId: 5,
          originStop: {
            id: 1,
            actionType: 'pickup',
            stop: { name: 'A', city: 'X', state: 'TX', address: '1' },
          },
          destStop: {
            id: 2,
            actionType: 'exchange',
            stop: { name: 'B', city: 'Y', state: 'IL', address: '2' },
          },
        },
        {
          legId: 'LEG-2',
          sequence: 2,
          status: 'IN_TRANSIT',
          driverId: 99,
          originStop: {
            id: 2,
            actionType: 'exchange',
            stop: { name: 'B', city: 'Y', state: 'IL', address: '2' },
          },
          destStop: {
            id: 3,
            actionType: 'delivery',
            stop: { name: 'C', city: 'Z', state: 'CA', address: '3' },
          },
        },
      ]);

      const result = await controller.getDriverView(driverUser, 'LD-1');

      expect(result).toHaveLength(1);
      expect(result[0].legId).toBe('LEG-1');
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.getDriverView(driverUser, 'NOPE')).rejects.toThrow(NotFoundException);
    });

    it('should throw if load is not a relay', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: false,
      });

      await expect(controller.getDriverView(driverUser, 'LD-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if driver not on any leg', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
      });
      mockPrisma.loadLeg.findMany.mockResolvedValue([{ legId: 'LEG-1', sequence: 1, driverId: 99 }]);

      await expect(controller.getDriverView(driverUser, 'LD-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /:load_id/revert-delivery (legacy)', () => {
    it('should delegate to loadReversalService and return refreshed load', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 10 });
      mockLoadReversalService.executeReversal.mockResolvedValue(undefined);
      mockLoadsService.findOne.mockResolvedValue({
        loadNumber: 'LD-1',
        status: 'IN_TRANSIT',
      });

      const result = await controller.revertDelivery('LD-1', { reason: 'Incorrect delivery confirmation' }, mockUser);

      expect(mockLoadReversalService.executeReversal).toHaveBeenCalledWith(
        1,
        'LD-1',
        'IN_TRANSIT',
        'dispatcher_correction',
        'Incorrect delivery confirmation',
        10,
        'DISPATCHER',
      );
      expect(result).toEqual({ loadNumber: 'LD-1', status: 'IN_TRANSIT' });
    });

    it('should use 0 as userId when user not found in DB', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockLoadReversalService.executeReversal.mockResolvedValue(undefined);
      mockLoadsService.findOne.mockResolvedValue({ loadId: 'LD-1' });

      await controller.revertDelivery('LD-1', { reason: 'Fix it now please' }, mockUser);

      expect(mockLoadReversalService.executeReversal).toHaveBeenCalledWith(
        1,
        'LD-1',
        'IN_TRANSIT',
        'dispatcher_correction',
        'Fix it now please',
        0,
        'DISPATCHER',
      );
    });
  });

  describe('GET /:load_id/revert-preview edge cases', () => {
    it('should throw on missing targetStatus', async () => {
      await expect(controller.previewReversal(mockUser, 'LD-1', undefined as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /:load_id/legs', () => {
    it('should return legs for a relay load', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10, isRelay: true });
      mockLoadLeg.getLegsForLoad.mockResolvedValue([
        { legId: 'LEG-1', driverId: 5 },
        { legId: 'LEG-2', driverId: 6 },
      ]);

      const result = await controller.getLegs(mockUser, 'LD-1');

      expect(result).toHaveLength(2);
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.getLegs(mockUser, 'LD-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if load is not a relay', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: false,
      });

      await expect(controller.getLegs(mockUser, 'LD-1')).rejects.toThrow(BadRequestException);
    });

    it('should scope legs to driver for DRIVER role', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      const mockLoadLeg = controller['loadLegService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10, isRelay: true });
      mockLoadLeg.getLegsForLoad.mockResolvedValue([
        { legId: 'LEG-1', driverId: 5 },
        { legId: 'LEG-2', driverId: 99 },
      ]);

      const result = await controller.getLegs(driverUser, 'LD-1');

      expect(result).toHaveLength(1);
      expect(result[0].legId).toBe('LEG-1');
    });
  });

  describe('POST /:load_id/legs', () => {
    it('should create legs from exchange points', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockLoadLeg.createLegsFromExchangePoints.mockResolvedValue([{ legId: 'LEG-1' }]);

      await controller.createLegs(mockUser, 'LD-1', {
        exchangeStopIds: [5, 6],
      });

      expect(mockLoadLeg.createLegsFromExchangePoints).toHaveBeenCalledWith(10, [5, 6], 1);
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.createLegs(mockUser, 'LD-1', { exchangeStopIds: [5] })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /:load_id/assign-all-legs', () => {
    it('should delegate to loadsService.assignAllLegs', async () => {
      mockLoadsService.assignAllLegs = jest.fn().mockResolvedValue({ loadId: 'LD-1' });

      await controller.assignAllLegs(mockUser, 'LD-1', {
        assignments: [
          { legId: 'LEG-1', driverId: 'DRV-1' },
          { legId: 'LEG-2', driverId: 'DRV-2' },
        ],
      });

      expect(mockLoadsService.assignAllLegs).toHaveBeenCalledWith(
        'LD-1',
        [
          { legId: 'LEG-1', driverId: 'DRV-1' },
          { legId: 'LEG-2', driverId: 'DRV-2' },
        ],
        1,
      );
    });
  });

  describe('PATCH /:load_id/legs/:leg_id/assign', () => {
    it('should assign a leg', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockLoadLeg.assignLeg.mockResolvedValue({ legId: 'LEG-1' });

      await controller.assignLeg(mockUser, 'LD-1', 'LEG-1', {
        driverId: 'DRV-1',
        vehicleId: 'VEH-1',
      });

      expect(mockLoadLeg.assignLeg).toHaveBeenCalledWith('LEG-1', 'DRV-1', 'VEH-1', 1, undefined);
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(
        controller.assignLeg(mockUser, 'LD-1', 'LEG-1', {
          driverId: 'DRV-1',
          vehicleId: 'VEH-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /:load_id/legs/:leg_id/status', () => {
    it('should advance leg status', async () => {
      const mockLoadLeg = controller['loadLegService'] as any;
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockLoadLeg.advanceLegStatus.mockResolvedValue({
        legId: 'LEG-1',
        status: 'IN_TRANSIT',
      });

      await controller.updateLegStatus(mockUser, 'LD-1', 'LEG-1', {
        status: 'IN_TRANSIT',
      });

      expect(mockLoadLeg.advanceLegStatus).toHaveBeenCalledWith('LEG-1', 'IN_TRANSIT', 1);
    });

    it('should throw if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(
        controller.updateLegStatus(mockUser, 'LD-1', 'LEG-1', {
          status: 'IN_TRANSIT',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /:load_id/legs/:leg_id/dispatch-sheet/send', () => {
    it('should throw if leg not found', async () => {
      mockPrisma.loadLeg = {
        ...mockPrisma.loadLeg,
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw if no driver on leg', async () => {
      mockPrisma.loadLeg = {
        ...mockPrisma.loadLeg,
        findFirst: jest.fn().mockResolvedValue({ legId: 'LEG-1', driver: null }),
      };

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw if driver has no email', async () => {
      mockPrisma.loadLeg = {
        ...mockPrisma.loadLeg,
        findFirst: jest.fn().mockResolvedValue({
          legId: 'LEG-1',
          driver: { email: null, name: 'John' },
        }),
      };

      await expect(controller.sendLegDispatchSheet('LD-1', 'LEG-1', mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('assertDriverLoadAccess', () => {
    it('should allow relay drivers assigned to a leg', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      mockPrisma.load.findFirst
        .mockResolvedValueOnce({ id: 10, driverId: null, isRelay: true }) // assertDriverLoadAccess
        .mockResolvedValueOnce({ id: 10, driverId: null }); // second internal call (for getLoad)
      mockPrisma.loadLeg.findFirst.mockResolvedValue({ id: 1, driverId: 5 });
      mockLoadsService.findOne.mockResolvedValue({ loadId: 'LD-1' });

      // Should not throw
      const result = await controller.getLoad(driverUser, 'LD-1');
      expect(result).toBeDefined();
    });

    it('should throw if relay driver is not on any leg', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: null,
        isRelay: true,
      });
      mockPrisma.loadLeg.findFirst.mockResolvedValue(null);

      await expect(controller.getLoad(driverUser, 'LD-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /:load_id/dispatch-sheet/pdf driver access', () => {
    it('should throw ForbiddenException if driver is not assigned to load', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      mockPrisma.load.findFirst.mockResolvedValue({ driverId: 99 });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.getLoadDispatchSheetPdf('LD-1', driverUser, mockRes)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if load not found for driver PDF', async () => {
      const driverUser = { ...mockUser, role: 'DRIVER', driverDbId: 5 };
      mockPrisma.load.findFirst.mockResolvedValue(null);

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.getLoadDispatchSheetPdf('LD-1', driverUser, mockRes)).rejects.toThrow(NotFoundException);
    });
  });
});
