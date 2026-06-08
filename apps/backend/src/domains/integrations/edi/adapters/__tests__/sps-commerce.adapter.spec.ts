import { SPSCommerceAdapter } from '../sps-commerce.adapter';
import { BadRequestException } from '@nestjs/common';

describe('SPSCommerceAdapter', () => {
  let adapter: SPSCommerceAdapter;

  beforeEach(() => {
    adapter = new SPSCommerceAdapter();
  });

  describe('parseTender', () => {
    const validPayload = {
      shipmentId: 'SHIP-001',
      brokerName: 'ABC Freight',
      brokerReference: 'BR-12345',
      controlNumber: 'CTL-001',
      equipmentType: 'dry_van',
      weightLbs: 40000,
      commodityType: 'Electronics',
      specialRequirements: 'Team driver required',
      totalCharge: 350000,
      responseDeadline: '2026-03-20T18:00:00Z',
      stops: [
        {
          sequence: 1,
          type: 'pickup',
          address: '123 Main St',
          city: 'Dallas',
          state: 'TX',
          zip: '75201',
          appointmentDate: '2026-03-18T08:00:00Z',
          contactName: 'John Doe',
          contactPhone: '555-1234',
        },
        {
          sequence: 2,
          type: 'delivery',
          address: '456 Oak Ave',
          city: 'Atlanta',
          state: 'GA',
          zip: '30301',
          appointmentDate: '2026-03-19T14:00:00Z',
        },
      ],
      metadata: { source: 'sps' },
    };

    it('should parse a valid 204 tender payload', async () => {
      const result = await adapter.parseTender(validPayload);

      expect(result.transactionSetId).toBe('CTL-001');
      expect(result.brokerName).toBe('ABC Freight');
      expect(result.brokerReference).toBe('BR-12345');
      expect(result.shipmentId).toBe('SHIP-001');
      expect(result.equipmentType).toBe('dry_van');
      expect(result.weightLbs).toBe(40000);
      expect(result.commodityType).toBe('Electronics');
      expect(result.specialRequirements).toBe('Team driver required');
      expect(result.rateCents).toBe(350000);
      expect(result.responseDeadline).toBe('2026-03-20T18:00:00Z');
      expect(result.stops).toHaveLength(2);
      expect(result.stops[0].actionType).toBe('pickup');
      expect(result.stops[0].city).toBe('Dallas');
      expect(result.stops[0].state).toBe('TX');
      expect(result.stops[1].actionType).toBe('delivery');
      expect(result.stops[1].city).toBe('Atlanta');
      expect(result.metadata).toEqual({ source: 'sps' });
    });

    it('should use shipmentId as brokerReference when brokerReference is missing', async () => {
      const payload = { ...validPayload, brokerReference: undefined };
      const result = await adapter.parseTender(payload);
      expect(result.brokerReference).toBe('SHIP-001');
    });

    it('should default equipmentType to dry_van when missing', async () => {
      const payload = { ...validPayload, equipmentType: undefined };
      const result = await adapter.parseTender(payload);
      expect(result.equipmentType).toBe('dry_van');
    });

    it('should throw BadRequestException when shipmentId is missing', async () => {
      const payload = { ...validPayload, shipmentId: undefined };
      await expect(adapter.parseTender(payload)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when brokerName is missing', async () => {
      const payload = { ...validPayload, brokerName: undefined };
      await expect(adapter.parseTender(payload)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when stops are empty', async () => {
      const payload = { ...validPayload, stops: [] };
      await expect(adapter.parseTender(payload)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when stops are missing', async () => {
      const payload = { ...validPayload, stops: undefined };
      await expect(adapter.parseTender(payload)).rejects.toThrow(BadRequestException);
    });

    it('should use transactionSetIdentifier as fallback for controlNumber', async () => {
      const payload = {
        ...validPayload,
        controlNumber: undefined,
        transactionSetIdentifier: 'TSI-999',
      };
      const result = await adapter.parseTender(payload);
      expect(result.transactionSetId).toBe('TSI-999');
    });
  });

  describe('sendTenderResponse', () => {
    const config = {
      baseUrl: 'https://api.spscommerce.com',
      apiKey: 'test-key',
    };

    beforeEach(() => {
      (global as any).fetch = jest.fn();
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should send accept response with code A', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ transactionSetId: 'TS-1' }),
      });

      const result = await adapter.sendTenderResponse(config, 'BR-001', 'accept');

      expect(result.success).toBe(true);
      expect(result.transactionSetId).toBe('TS-1');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.spscommerce.com/v1/transactions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"responseCode":"A"'),
        }),
      );
    });

    it('should send decline response with code D', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ transactionSetId: 'TS-2' }),
      });

      const result = await adapter.sendTenderResponse(config, 'BR-002', 'decline');

      expect(result.success).toBe(true);
      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.responseCode).toBe('D');
    });

    it('should send counter response with code C and counter rate', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ transactionSetId: 'TS-3' }),
      });

      const result = await adapter.sendTenderResponse(config, 'BR-003', 'counter', 3000);

      expect(result.success).toBe(true);
      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.responseCode).toBe('C');
      expect(callBody.counterRate).toBe(3000);
    });

    it('should return error result on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await adapter.sendTenderResponse(config, 'BR-004', 'accept');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe('sendInvoice', () => {
    beforeEach(() => {
      (global as any).fetch = jest.fn();
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should send invoice with 210 transaction identifier', async () => {
      const config = { apiKey: 'test-key' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ transactionSetId: 'TS-INV-1' }),
      });

      const result = await adapter.sendInvoice(config, {
        invoiceNumber: 'INV-001',
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.transactionSetIdentifier).toBe('210');
    });
  });

  describe('sendStatusUpdate', () => {
    beforeEach(() => {
      (global as any).fetch = jest.fn();
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should send status update with 214 transaction identifier', async () => {
      const config = { apiKey: 'test-key' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ transactionSetId: 'TS-ST-1' }),
      });

      const result = await adapter.sendStatusUpdate(config, {
        shipmentId: 'SHIP-1',
        status: 'delivered',
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.transactionSetIdentifier).toBe('214');
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      (global as any).fetch = jest.fn();
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should return true on successful connection', async () => {
      const config = { apiKey: 'test-key' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '{}',
      });

      const result = await adapter.testConnection(config);

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/connection/test'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should return false on connection failure', async () => {
      const config = { apiKey: 'test-key' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const result = await adapter.testConnection(config);

      expect(result).toBe(false);
    });
  });
});
