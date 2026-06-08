import { AlertManagementTool } from '../alert-management.tool';

describe('AlertManagementTool', () => {
  let tool: AlertManagementTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      alertNote: {
        create: jest.fn(),
      },
    };
    tool = new AlertManagementTool(mockPrisma);
  });

  describe('getAlerts', () => {
    it('returns alerts with driver names resolved', async () => {
      // Phase 2 Task 10 — alerts now include the driver relation; the
      // display name comes from there, not a separate findMany round-trip.
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          alertId: 'alert_1',
          alertType: 'hos_violation',
          category: 'compliance',
          priority: 'high',
          status: 'active',
          title: 'HOS Violation',
          message: 'Driver exceeded hours',
          recommendedAction: 'Stop driving',
          driverId: 7,
          driver: { driverId: 'drv_1', name: 'John Smith' },
          createdAt: new Date('2026-01-01'),
          notes: [{ content: 'Latest note' }],
        },
      ]);

      const result = await tool.getAlerts({
        status: 'ACTIVE',
        limit: 20,
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.alerts[0].driver).toBe('John Smith');
      expect(result._card.type).toBe('alert_list');
    });

    it('filters by driver name when provided', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ driverId: 'drv_1' }]);
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await tool.getAlerts({
        driverName: 'John',
        limit: 20,
        _tenantId: 1,
      });

      expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'John', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('acknowledgeAlert', () => {
    it('acknowledges an active alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        id: 1,
        alertId: 'alert_1',
        status: 'ACTIVE',
      });
      mockPrisma.alert.update.mockResolvedValue({});

      const result = await tool.acknowledgeAlert({
        alertId: 'alert_1',
        note: 'Acknowledged by dispatcher',
        _tenantId: 1,
        _userId: 'user_1',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.newStatus).toBe('ACKNOWLEDGED');
      expect(mockPrisma.alertNote.create).toHaveBeenCalled();
    });

    it('returns error for non-existent alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      const result = await tool.acknowledgeAlert({
        alertId: 'alert_unknown',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not found');
    });

    it('returns error for non-active alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        id: 1,
        alertId: 'alert_1',
        status: 'RESOLVED',
      });

      const result = await tool.acknowledgeAlert({
        alertId: 'alert_1',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('already RESOLVED');
    });
  });

  describe('resolveAlert', () => {
    it('resolves an alert with note', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        id: 1,
        alertId: 'alert_1',
        status: 'ACTIVE',
        autoResolved: false,
      });
      mockPrisma.alert.update.mockResolvedValue({});

      const result = await tool.resolveAlert({
        alertId: 'alert_1',
        resolutionNote: 'Fixed the issue',
        _tenantId: 1,
        _userId: 'user_1',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.newStatus).toBe('RESOLVED');
      expect(mockPrisma.alertNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Resolved: Fixed the issue',
          }),
        }),
      );
    });

    it('returns error for already resolved alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        id: 1,
        alertId: 'alert_1',
        status: 'RESOLVED',
        autoResolved: false,
      });

      const result = await tool.resolveAlert({
        alertId: 'alert_1',
        resolutionNote: 'test',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('already resolved');
    });

    it('returns error for not found alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      const result = await tool.resolveAlert({
        alertId: 'alert_x',
        resolutionNote: 'test',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not found');
    });
  });
});
