import { CustomerPortalTool } from '../customer-portal.tool';

describe('CustomerPortalTool', () => {
  let tool: CustomerPortalTool;
  let mockPrisma: any;

  const mockLoad = {
    loadNumber: 'L-1045',
    status: 'IN_TRANSIT',
    customerName: 'Acme Corp',
    referenceNumber: 'REF-123',
    equipmentType: 'dry_van',
    weightLbs: 42000,
    commodityType: 'general',
    estimatedMiles: 500,
    createdAt: new Date('2026-01-01'),
    stops: [
      {
        sequenceOrder: 1,
        actionType: 'pickup',
        status: 'completed',
        appointmentDate: new Date(),
        arrivedAt: new Date(),
        completedAt: new Date(),
        stop: {
          name: 'Origin Warehouse',
          city: 'Dallas',
          state: 'TX',
          address: '123 Main St',
        },
      },
      {
        sequenceOrder: 2,
        actionType: 'delivery',
        status: 'PENDING',
        appointmentDate: new Date(),
        arrivedAt: null,
        completedAt: null,
        stop: {
          name: 'Dest Warehouse',
          city: 'Chicago',
          state: 'IL',
          address: '456 Oak Ave',
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ customerId: 100 }) },
      load: {
        findMany: jest.fn().mockResolvedValue([mockLoad]),
        findFirst: jest.fn().mockResolvedValue(mockLoad),
      },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    };

    tool = new CustomerPortalTool(mockPrisma);
  });

  describe('queryMyShipments', () => {
    it('should return error without user context', async () => {
      const result = await tool.queryMyShipments({ limit: 20 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('User context required');
    });

    it('should return error when no customer linked', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ customerId: null });
      const result = await tool.queryMyShipments({
        limit: 20,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('No customer account linked');
    });

    it('should return shipments', async () => {
      const result = await tool.queryMyShipments({
        limit: 20,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.shipments[0].status).toBe('IN_TRANSIT');
      expect(parsed.shipments[0].origin).toBe('Dallas, TX');
    });

    it('should map booked status to assigned/dispatched', async () => {
      mockPrisma.load.findMany.mockResolvedValue([{ ...mockLoad, status: 'ASSIGNED' }]);
      const result = await tool.queryMyShipments({
        limit: 20,
        _userId: 'user_1',
        status: 'booked',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.shipments[0].status).toBe('booked');
    });
  });

  describe('getShipmentDetail', () => {
    it('should return error without user context', async () => {
      const result = await tool.getShipmentDetail({ shipmentNumber: 'L-1045' });
      expect(JSON.parse(result.content[0].text).error).toBe('User context required');
    });

    it('should return shipment details', async () => {
      const result = await tool.getShipmentDetail({
        shipmentNumber: 'L-1045',
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.shipmentNumber).toBe('L-1045');
      expect(parsed.stops).toHaveLength(2);
    });

    it('should return error for not found shipment', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      const result = await tool.getShipmentDetail({
        shipmentNumber: 'L-9999',
        _userId: 'user_1',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No shipment found');
    });
  });

  describe('getMyDocuments', () => {
    it('should return error without user context', async () => {
      const result = await tool.getMyDocuments({ shipmentNumber: 'L-1045' });
      expect(JSON.parse(result.content[0].text).error).toBe('User context required');
    });

    it('should return documents for a load', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 1,
          documentType: 'BOL',
          fileName: 'bol.pdf',
          status: 'active',
          createdAt: new Date(),
        },
      ]);
      const result = await tool.getMyDocuments({
        shipmentNumber: 'L-1045',
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
    });

    it('should return error for not found load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      const result = await tool.getMyDocuments({
        shipmentNumber: 'L-9999',
        _userId: 'user_1',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No shipment found');
    });
  });

  describe('getMyInvoices', () => {
    it('should return error without user context', async () => {
      const result = await tool.getMyInvoices({ limit: 20 });
      expect(JSON.parse(result.content[0].text).error).toBe('User context required');
    });

    it('should return invoices', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-001',
          status: 'SENT',
          totalCents: 320000,
          paidCents: 0,
          balanceCents: 320000,
          issueDate: '2026-01-01',
          dueDate: '2026-02-01',
          lineItems: [{ description: 'Freight charge', totalCents: 320000 }],
        },
      ]);
      const result = await tool.getMyInvoices({
        limit: 20,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.invoices[0].totalAmount).toBe('$3200.00');
    });

    it('should return error for invalid status', async () => {
      const result = await tool.getMyInvoices({
        limit: 20,
        _userId: 'user_1',
        status: 'INVALID',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Invalid status');
    });
  });
});
