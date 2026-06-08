import { DEFAULT_TENANT_TIMEZONE } from '@app/shared-types';

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
