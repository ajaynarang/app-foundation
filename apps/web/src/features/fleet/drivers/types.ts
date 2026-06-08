export type {
  Driver,
  DriverHOS,
  CreateDriverInput as CreateDriverRequest,
  UpdateDriverInput as UpdateDriverRequest,
  ActivateAndInviteResponse,
} from '@sally/shared-types';

// Keep utility function here (not a type)
export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    mock_truckbase_tms: 'Truckbase TMS',
    MOCK_TRUCKBASE_TMS: 'Truckbase TMS',
    samsara_eld: 'Samsara ELD',
    SAMSARA_ELD: 'Samsara ELD',
    motive_eld: 'Motive',
    MOTIVE_ELD: 'Motive',
    mcleod_tms: 'McLeod',
    MCLEOD_TMS: 'McLeod',
    PROJECT44_TMS: 'Project44 TMS',
    project44_tms: 'Project44 TMS',
  };
  return labels[source] || source;
}

/**
 * Returns true if the source is an ELD integration (not TMS).
 */
export function isEldSource(source: string): boolean {
  const eldSources = ['samsara_eld', 'SAMSARA_ELD', 'motive_eld', 'MOTIVE_ELD'];
  return eldSources.includes(source);
}
