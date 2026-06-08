import { EntityResolver, errorResponse } from '../utils/entity-resolver';

describe('EntityResolver', () => {
  let resolver: EntityResolver;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: { findFirst: jest.fn() },
      driver: { findMany: jest.fn() },
      vehicle: { findMany: jest.fn() },
      recurringLane: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    resolver = new EntityResolver(mockPrisma);
  });

  describe('resolveLoad', () => {
    it('returns load when found', async () => {
      const load = { id: 1, loadNumber: 'L-1001' };
      mockPrisma.load.findFirst.mockResolvedValue(load);

      const result = await resolver.resolveLoad('L-1001', 1);
      expect(result.data).toEqual(load);
    });

    it('strips L- prefix when searching', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ id: 1 });
      await resolver.resolveLoad('L-1001', 1);

      expect(mockPrisma.load.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            loadNumber: { contains: '1001', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('returns error when load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      const result = await resolver.resolveLoad('L-9999', 1);
      expect(result.error).toContain('not found');
    });
  });

  describe('resolveDriver', () => {
    it('returns driver when exactly one match', async () => {
      const driver = { id: 1, name: 'John Smith' };
      mockPrisma.driver.findMany.mockResolvedValue([driver]);

      const result = await resolver.resolveDriver('John', 1);
      expect(result.data).toEqual(driver);
    });

    it('returns error when no matches', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);
      const result = await resolver.resolveDriver('Nobody', 1);
      expect(result.error).toContain('No driver found');
    });

    it('returns error when multiple matches', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ name: 'John Smith' }, { name: 'John Doe' }]);
      const result = await resolver.resolveDriver('John', 1);
      expect(result.error).toContain('Multiple drivers');
      expect(result.error).toContain('John Smith');
    });
  });

  describe('resolveVehicle', () => {
    it('returns vehicle when exactly one match', async () => {
      const vehicle = { id: 1, unitNumber: 'TRK-101' };
      mockPrisma.vehicle.findMany.mockResolvedValue([vehicle]);

      const result = await resolver.resolveVehicle('TRK-101', 1);
      expect(result.data).toEqual(vehicle);
    });

    it('returns error when no matches', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);
      const result = await resolver.resolveVehicle('NONE', 1);
      expect(result.error).toContain('No vehicle found');
    });

    it('returns error when multiple matches', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([{ unitNumber: 'TRK-101' }, { unitNumber: 'TRK-102' }]);
      const result = await resolver.resolveVehicle('TRK', 1);
      expect(result.error).toContain('Multiple vehicles');
    });
  });

  describe('resolveLane', () => {
    it('resolves by lane ID', async () => {
      const lane = { id: 1, name: 'Dallas-Houston' };
      mockPrisma.recurringLane.findFirst.mockResolvedValue(lane);

      const result = await resolver.resolveLane(undefined, 1, 1);
      expect(result.data).toEqual(lane);
    });

    it('resolves by lane name', async () => {
      const lane = { id: 1, name: 'Dallas-Houston' };
      mockPrisma.recurringLane.findMany.mockResolvedValue([lane]);

      const result = await resolver.resolveLane('Dallas', undefined, 1);
      expect(result.data).toEqual(lane);
    });

    it('returns error when neither name nor id provided', async () => {
      const result = await resolver.resolveLane(undefined, undefined, 1);
      expect(result.error).toContain('lane name or lane ID');
    });

    it('returns error when lane ID not found', async () => {
      mockPrisma.recurringLane.findFirst.mockResolvedValue(null);
      const result = await resolver.resolveLane(undefined, 999, 1);
      expect(result.error).toContain('not found');
    });

    it('returns error when multiple lanes match name', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([{ name: 'Dallas-Houston' }, { name: 'Dallas-Austin' }]);
      const result = await resolver.resolveLane('Dallas', undefined, 1);
      expect(result.error).toContain('Multiple lanes');
    });
  });

  describe('errorResponse', () => {
    it('returns standard MCP error format', () => {
      const result = errorResponse('Something went wrong');
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Something went wrong');
    });
  });
});
