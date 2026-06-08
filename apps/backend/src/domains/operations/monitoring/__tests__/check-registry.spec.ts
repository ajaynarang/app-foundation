import { CheckRegistry } from '../checks/check.registry';

describe('CheckRegistry', () => {
  let registry: CheckRegistry;

  beforeEach(() => {
    registry = new CheckRegistry();
  });

  it('should register all 17 checks', () => {
    expect(registry.getAll()).toHaveLength(17);
  });

  it('should categorize checks correctly', () => {
    const byCategory = registry.getByCategory('hos_compliance');
    expect(byCategory).toHaveLength(5);
  });

  it('should separate per-driver and per-load checks', () => {
    const driverChecks = registry.getByScope('per-driver');
    const loadChecks = registry.getByScope('per-load');
    expect(driverChecks.length).toBeGreaterThan(0);
    expect(loadChecks.length).toBeGreaterThan(0);
    expect(driverChecks.length + loadChecks.length).toBe(17);
  });

  it('should resolve active checks based on available capabilities', () => {
    const available = new Set(['hos_data']);
    const { active, inactive } = registry.resolveChecks(available);
    // HOS checks (5) + time-based checks with no needs
    expect(active.length).toBeGreaterThanOrEqual(5);
    // GPS-dependent checks should be inactive
    const inactiveIds = inactive.map((c) => c.id);
    expect(inactiveIds).toContain('appointment_at_risk');
    expect(inactiveIds).toContain('off_pace');
    expect(inactiveIds).toContain('driver_not_moving');
    expect(inactiveIds).toContain('fuel_low');
  });

  it('should make all checks active when all capabilities available', () => {
    const available = new Set(['hos_data', 'gps_data', 'vehicle_state', 'route_plan_data']);
    const { active, inactive } = registry.resolveChecks(available);
    expect(active).toHaveLength(17);
    expect(inactive).toHaveLength(0);
  });
});
