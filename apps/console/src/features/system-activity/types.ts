export type { JobStatus, Job, TypeSummary, CategorySummary, PaginatedJobs } from '@app/shared-types';

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  tms: 'Fleet Sync',
  eld: 'ELD Sync',
  accounting: 'Accounting',
  compliance: 'Compliance',
  documents: 'Documents',
  webhooks: 'Webhooks',
  maintenance: 'Maintenance',
  lanes: 'Lanes',
  oauth: 'OAuth',
};

export const TYPE_DISPLAY_NAMES: Record<string, string> = {
  drivers: 'Drivers',
  vehicles: 'Vehicles',
  loads: 'Loads',
  hos: 'HOS',
  gps: 'GPS',
  enrichment: 'ELD Enrichment',
  invoice: 'Invoice',
  settlement: 'Settlement',
  payment: 'Payment',
  'settlement-payment': 'Settlement Payment',
  'webhook-payment': 'Payment (from QB)',
  'webhook-bill-payment': 'Bill Payment (from QB)',
  'initial-sync': 'Initial Sync',
  audit: 'Audit',
  ratecon: 'Rate Confirmation',
  'login-events': 'Login Events',
  tokens: 'Refresh Tokens',
  uploads: 'Expired Uploads',
  'trial-expiry': 'Trial Expiry',
  generate: 'Generate',
  'auto-generation': 'Auto Generation',
  deliver: 'Delivery',
  'token-refresh': 'Token Refresh',
};

// URL-safe category slugs (category names are already URL-safe)
export const CATEGORY_SLUGS: Record<string, string> = {
  tms: 'tms',
  eld: 'eld',
  accounting: 'accounting',
  compliance: 'compliance',
  documents: 'documents',
  webhooks: 'webhooks',
  maintenance: 'maintenance',
  lanes: 'lanes',
  oauth: 'oauth',
};
