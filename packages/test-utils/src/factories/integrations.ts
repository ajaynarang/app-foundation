import { unique } from './common.js';

/**
 * Build a POST /integrations body.
 *
 * The starter ships an EMPTY vendor registry (`VENDOR_REGISTRY` in
 * `apps/backend/src/domains/integrations/`) — add your connectors there,
 * then extend the `defaults` map below with each vendor's credential
 * shape. The service rejects missing required credential fields at the
 * DTO layer.
 */
export function buildIntegrationCreate(vendor: string = 'EXAMPLE_VENDOR', overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, { integrationType: string; credentials: Record<string, string> }> = {
    EXAMPLE_VENDOR: {
      integrationType: 'API',
      credentials: { apiKey: unique('example-key'), baseUrl: 'https://api.example.com' },
    },
  };
  const config = defaults[vendor] ?? defaults.EXAMPLE_VENDOR;
  return {
    integrationType: config.integrationType,
    vendor,
    displayName: `[QA-TEST] ${vendor} ${unique('probe')}`,
    credentials: config.credentials,
    ...overrides,
  };
}

/** Build a PATCH /integrations/:id body — all fields optional. */
export function buildIntegrationUpdate(overrides: Record<string, unknown> = {}) {
  return {
    displayName: `[QA-TEST] renamed-${unique('patch')}`,
    ...overrides,
  };
}
