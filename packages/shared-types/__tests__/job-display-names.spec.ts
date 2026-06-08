/// <reference types="jest" />
import { TYPE_DISPLAY_NAMES, CATEGORY_DISPLAY_NAMES } from '../src/infrastructure/job-display-names';

describe('job display names', () => {
  it('exports type display names', () => {
    expect(TYPE_DISPLAY_NAMES['ratecon']).toBe('Rate Confirmation');
  });

  it('exports category display names', () => {
    expect(CATEGORY_DISPLAY_NAMES['telemetry']).toBe('Telemetry');
    expect(CATEGORY_DISPLAY_NAMES['safety']).toBe('Safety & Compliance');
    expect(CATEGORY_DISPLAY_NAMES['geo']).toBe('Routing & Geo');
  });

  it('covers every backend JOB_CATEGORIES key in CATEGORY_DISPLAY_NAMES', () => {
    // Sanity: all categories used in the system have a display name.
    // Mirrors the keys of JOB_CATEGORIES in the backend job.types.ts.
    const expectedCategories = [
      'telemetry',
      'safety',
      'notifications',
      'webhooks',
      'vendor',
      'documents',
      'geo',
      'finance',
      'events',
      'maintenance',
    ];
    for (const c of expectedCategories) {
      expect(CATEGORY_DISPLAY_NAMES[c]).toBeDefined();
    }
  });

  it('preserves canonical type labels', () => {
    expect(TYPE_DISPLAY_NAMES['fleet-sync']).toBe('Fleet Sync');
    expect(TYPE_DISPLAY_NAMES['webhook-payment']).toBe('Payment (from QB)');
    expect(TYPE_DISPLAY_NAMES['job-cleanup']).toBe('Job Record Cleanup');
  });
});
