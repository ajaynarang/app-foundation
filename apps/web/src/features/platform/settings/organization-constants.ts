import { CarrierType, FleetSize, DEFAULT_TENANT_TIMEZONE } from '@app/shared-types';

/** Carrier-type select options, keyed off the shared-types enum (no literals). */
export const CARRIER_TYPE_OPTIONS: ReadonlyArray<{ value: CarrierType; label: string }> = [
  { value: CarrierType.FOR_HIRE_INTERSTATE, label: 'For-Hire Interstate' },
  { value: CarrierType.INTRASTATE_ONLY, label: 'Intrastate Only' },
  { value: CarrierType.PRIVATE_FLEET, label: 'Private Fleet' },
  { value: CarrierType.LEASED_ON, label: 'Under Another Authority' },
];

/** Fleet-size select options, keyed off the shared-types enum (no literals). */
export const FLEET_SIZE_OPTIONS: ReadonlyArray<{ value: FleetSize; label: string }> = [
  { value: FleetSize.SIZE_1_10, label: '1-10 vehicles' },
  { value: FleetSize.SIZE_11_50, label: '11-50 vehicles' },
  { value: FleetSize.SIZE_51_100, label: '51-100 vehicles' },
  { value: FleetSize.SIZE_101_500, label: '101-500 vehicles' },
  { value: FleetSize.SIZE_500_PLUS, label: '500+ vehicles' },
];

/**
 * Curated US-zone timezone options for the Organization settings form. The
 * value currently saved is preserved even if it's outside this list (see the
 * form's value-merge). Default is `DEFAULT_TENANT_TIMEZONE`.
 */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'America/New_York', label: 'Eastern — America/New_York' },
  { value: 'America/Chicago', label: 'Central — America/Chicago' },
  { value: 'America/Denver', label: 'Mountain — America/Denver' },
  { value: 'America/Phoenix', label: 'Arizona — America/Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific — America/Los_Angeles' },
  { value: 'America/Anchorage', label: 'Alaska — America/Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — Pacific/Honolulu' },
  { value: DEFAULT_TENANT_TIMEZONE, label: 'UTC' },
];
