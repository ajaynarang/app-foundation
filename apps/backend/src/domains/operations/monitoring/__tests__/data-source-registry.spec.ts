import { DataSourceRegistry } from '../data-sources/data-source.registry';

describe('DataSourceRegistry', () => {
  let registry: DataSourceRegistry;

  beforeEach(() => {
    registry = new DataSourceRegistry();
  });

  describe('getAll', () => {
    it('should return all registered data sources', () => {
      const sources = registry.getAll();
      expect(sources.length).toBeGreaterThanOrEqual(4);
      expect(sources.map((s) => s.id)).toEqual(expect.arrayContaining(['hos', 'gps', 'fleet', 'loads']));
    });
  });

  describe('getById', () => {
    it('should return source by id', () => {
      const source = registry.getById('hos');
      expect(source).toBeDefined();
      expect(source.provides).toContain('hos_data');
      expect(source.sourceType).toBe('integration');
    });

    it('should return undefined for unknown id', () => {
      expect(registry.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('getSourcesProvidingCapability', () => {
    it('should find sources that provide a capability', () => {
      const sources = registry.getSourcesProvidingCapability('hos_data');
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('hos');
    });

    it('should return empty for unknown capability', () => {
      expect(registry.getSourcesProvidingCapability('magic_data')).toHaveLength(0);
    });
  });

  describe('getAllCapabilities', () => {
    it('should return all unique capabilities', () => {
      const caps = registry.getAllCapabilities();
      expect(caps).toEqual(
        expect.arrayContaining(['hos_data', 'gps_data', 'vehicle_state', 'driver_data', 'vehicle_data', 'load_data']),
      );
    });
  });
});
