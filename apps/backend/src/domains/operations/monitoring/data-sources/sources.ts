import { DataSourceDefinition } from '../monitoring.types';

export const HOS_SOURCE: DataSourceDefinition = {
  id: 'hos',
  displayName: 'HOS Sync',
  provides: ['hos_data'],
  sourceType: 'integration',
  freshnessStrategy: 'schedule',
  integrationRequirement: { type: 'ELD', status: 'ACTIVE' },
};

export const GPS_SOURCE: DataSourceDefinition = {
  id: 'gps',
  displayName: 'GPS Sync',
  provides: ['gps_data', 'vehicle_state'],
  sourceType: 'integration',
  freshnessStrategy: 'schedule',
  integrationRequirement: { type: 'ELD', status: 'ACTIVE' },
};

export const FLEET_SOURCE: DataSourceDefinition = {
  id: 'fleet',
  displayName: 'Fleet Sync',
  provides: ['driver_data', 'vehicle_data'],
  sourceType: 'integration',
  freshnessStrategy: 'schedule',
  integrationRequirement: { type: 'TMS', status: 'ACTIVE' },
};

export const LOADS_SOURCE: DataSourceDefinition = {
  id: 'loads',
  displayName: 'Loads Sync',
  provides: ['load_data'],
  sourceType: 'integration',
  freshnessStrategy: 'schedule',
  integrationRequirement: { type: 'TMS', status: 'ACTIVE' },
};

export const ROUTE_PLAN_SOURCE: DataSourceDefinition = {
  id: 'route_plan',
  displayName: 'Route Plan Data',
  provides: ['route_plan_data'],
  sourceType: 'platform_service',
  freshnessStrategy: 'ttl',
};

export const ALL_DATA_SOURCES: DataSourceDefinition[] = [
  HOS_SOURCE,
  GPS_SOURCE,
  FLEET_SOURCE,
  LOADS_SOURCE,
  ROUTE_PLAN_SOURCE,
];
