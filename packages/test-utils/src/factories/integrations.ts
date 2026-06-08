import { unique } from './common.js';

/**
 * Build a POST /integrations body. Defaults to a McLeod TMS shape
 * because MCLEOD_TMS requires the fewest credential fields (apiKey +
 * baseUrl) and its adapter stubs the test-connection call in dev,
 * which returns `success: true` deterministically (IntegrationDataService
 * falls back to a stubbed adapter when none is registered).
 *
 * Caller can override `vendor` + matching `credentials` for any other
 * vendor in VENDOR_REGISTRY (samsara, motive, quickbooks, etc.). The
 * service rejects missing required credential fields at the DTO layer.
 */
export function buildIntegrationCreate(
  vendor: string = 'MCLEOD_TMS',
  overrides: Record<string, unknown> = {},
) {
  const defaults: Record<string, { integrationType: string; credentials: Record<string, string> }> = {
    MCLEOD_TMS: {
      integrationType: 'TMS',
      credentials: { apiKey: unique('mcleod-key'), baseUrl: 'https://api.mcleodsoft.com' },
    },
    TMW_TMS: {
      integrationType: 'TMS',
      credentials: { apiKey: unique('tmw-key'), baseUrl: 'https://api.tmwsystems.com' },
    },
    PROJECT44_TMS: {
      integrationType: 'TMS',
      credentials: { clientId: unique('p44-client'), clientSecret: unique('p44-secret') },
    },
    SAMSARA_ELD: {
      integrationType: 'ELD',
      credentials: { apiToken: unique('samsara-api') },
    },
    MOTIVE_ELD: {
      integrationType: 'ELD',
      credentials: { apiToken: unique('motive-api') },
    },
    DAT_LOAD_BOARD: {
      integrationType: 'LOAD_BOARD',
      credentials: { apiKey: unique('dat-key'), apiSecret: unique('dat-secret') },
    },
  };
  const config = defaults[vendor] ?? defaults.MCLEOD_TMS;
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

/**
 * Build a POST /drivers/:id/link-eld or POST /vehicles/:id/link-eld
 * body. Both endpoints accept an optional `eldId` — when omitted, the
 * service runs auto-match. Tests covering the manual path pass an
 * explicit `eldId` pulled from GET /integrations/eld/drivers or
 * /vehicles first.
 */
export function buildEldLinkRequest(overrides: { eldId?: string } = {}) {
  return {
    ...overrides,
  };
}

export function buildTradingPartner(overrides: Record<string, unknown> = {}) {
  const isaId = unique('ISA');
  return {
    name: `Test Partner ${isaId}`,
    isaId,
    gsId: isaId,
    vanProvider: 'SPS_COMMERCE',
    supportedMessages: ['T204', 'T210', 'T214'],
    statusUpdateLevel: 'STANDARD',
    ...overrides,
  };
}

export function buildAutoAcceptRule(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Rule ${unique('rule')}`,
    conditions: {
      minRatePerMile: 2.5,
      equipmentTypes: ['dry_van'],
    },
    priority: 10,
    ...overrides,
  };
}

/**
 * Build a PATCH /accounting/mappings/:id body (Phase 5 Group 5c tests 32).
 * Controller expects `{externalId, externalName}` (accounting.controller.ts
 * line 154). Unique values so the echo assertion has signal.
 */
export function buildAccountingMappingPatch(overrides: Record<string, unknown> = {}) {
  const id = unique('qb');
  return {
    externalId: `qb-${id}`,
    externalName: `[QA-TEST] QB Customer ${id}`,
    ...overrides,
  };
}

/**
 * Build a PATCH /accounting/account-mappings/:id body (Phase 5 Group 5c test 35).
 * Controller expects `{externalAccountId, externalAccountName}`
 * (accounting.controller.ts line 185).
 */
export function buildAccountAccountMappingPatch(overrides: Record<string, unknown> = {}) {
  const id = unique('acct');
  return {
    externalAccountId: `qb-acct-${id}`,
    externalAccountName: `[QA-TEST] QB Account ${id}`,
    ...overrides,
  };
}

/**
 * Build a QuickBooks webhook CDC (Change Data Capture) payload for
 * POST /accounting/webhook (Phase 5 Group 5c test 39).
 *
 * Shape matches `QuickBooksAdapter.parseWebhookEvents` expectation
 * (quickbooks.adapter.ts lines 557–572) — `eventNotifications[]` each
 * with `realmId` + `dataChangeEvent.entities[]`.
 *
 * Default `realmId` is `0000000000` — intentionally won't match any
 * seeded integration. The service logs "no integration found" but the
 * webhook endpoint STILL returns 200 + `{received: true}` because QB
 * requires a fast 200 response (controller lines 128–129).
 *
 * The caller is responsible for signing `JSON.stringify(payloadObj)`
 * with `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` via `signIntuitWebhook`.
 */
export function buildAccountingWebhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventNotifications: [
      {
        realmId: '0000000000',
        dataChangeEvent: {
          entities: [
            {
              name: 'Payment',
              id: `1001-${unique('ent')}`,
              operation: 'Create',
              lastUpdated: new Date().toISOString(),
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

/**
 * Build a PATCH /edi/settings/partners/:partnerId body (Phase 5 Group 5d test 43).
 * UpdatePartnerDto fields are all optional; we patch `name` +
 * `statusUpdateLevel` for an echo-check with signal.
 */
export function buildTradingPartnerPatch(overrides: Record<string, unknown> = {}) {
  return {
    name: `[QA-TEST] Renamed Partner ${unique('patch')}`,
    // EDIStatusUpdateLevel enum — only 'STANDARD' | 'ENHANCED' are
    // valid values (Prisma schema). Flip to ENHANCED so the echo
    // check has signal (base partner is created as STANDARD).
    statusUpdateLevel: 'ENHANCED',
    ...overrides,
  };
}

/**
 * Build a POST /edi/tenders/:loadId/respond body (Phase 5 Group 5d test 46).
 * Controller DTO: `{response: 'accept'|'decline'|'counter',
 * counterRateCents?: number}`. Default 'accept' — simplest happy path.
 */
export function buildEdiTenderResponse(overrides: {
  response?: 'accept' | 'decline' | 'counter';
  counterRateCents?: number;
} = {}) {
  return {
    response: overrides.response ?? ('accept' as const),
    ...(overrides.counterRateCents !== undefined && { counterRateCents: overrides.counterRateCents }),
  };
}

/**
 * Build a POST /edi/tenders/rules body (Phase 5 Group 5d test 48).
 * Equivalent to `buildAutoAcceptRule` on the wire — the controller's
 * `CreateRuleDto` accepts {name, conditions, tradingPartnerId?, priority?}.
 * Kept as a named alias for readability in the create-test.
 */
export function buildAutoAcceptRuleCreate(overrides: Record<string, unknown> = {}) {
  return buildAutoAcceptRule(overrides);
}

/**
 * Build a POST /integrations/email-intake/threads/:id/confirm body
 * (Phase 5 Group 5e test 53). ConfirmEmailLoadDto requires `attachmentId`;
 * all other fields are optional overrides (customerId, rateCents, etc.).
 *
 * Default values leave the service free to resolve from the thread's
 * latest parsed attachment, so the caller typically only supplies
 * `attachmentId`.
 */
export function buildConfirmEmailLoad(
  overrides: { attachmentId?: string } & Record<string, unknown> = {},
) {
  return {
    attachmentId: overrides.attachmentId ?? `att-${unique('confirm')}`,
    ...overrides,
  };
}

/**
 * Build a PUT /integrations/email-intake/settings body (Phase 5 Group 5e
 * test 59). UpdateEmailIntakeSettingsDto fields are all optional:
 * {approvedDomains?, autoApproveCustomerDomains?, unknownSenderPolicy?,
 * isEnabled?}. Default patches `autoApproveCustomerDomains` so the
 * echo-check has signal without touching the inbound-address-dependent
 * `isEnabled` flag.
 */
export function buildEmailIntakeSettingsPatch(
  overrides: {
    approvedDomains?: string[];
    autoApproveCustomerDomains?: boolean;
    unknownSenderPolicy?: 'HOLD' | 'PARSE_ANYWAY' | 'REJECT';
    isEnabled?: boolean;
  } = {},
) {
  return {
    autoApproveCustomerDomains: overrides.autoApproveCustomerDomains ?? false,
    ...(overrides.approvedDomains !== undefined && { approvedDomains: overrides.approvedDomains }),
    ...(overrides.unknownSenderPolicy !== undefined && { unknownSenderPolicy: overrides.unknownSenderPolicy }),
    ...(overrides.isEnabled !== undefined && { isEnabled: overrides.isEnabled }),
  };
}

/**
 * Build a POST /integrations/email-intake/webhook payload in the LEGACY
 * FLAT format (Phase 5 Group 5e test 60). This matches
 * `ResendInboundEmailDataDto` directly — NOT the `{type, data}` envelope.
 *
 * The controller's `else` branch (webhook controller lines 59–63) handles
 * the flat payload without signature verification, which is the
 * dev-bypass shape we test against (finding #44).
 *
 * Default `to` is an address NOT owned by the demo-northstar tenant —
 * `resolveTenant` returns null and the handler short-circuits to
 * `{status: 'ignored', reason: 'unknown_recipient'}` with a 200 response.
 * That is the assertion target for test 60.
 */
export function buildEmailIntakeWebhookPayload(
  overrides: Record<string, unknown> = {},
) {
  const ts = Date.now();
  return {
    email_id: `qa-email-${unique('webhook')}`,
    from: unique('sender') + '@qa-test.example',
    to: [`unknown-recipient-${ts}@example.invalid`],
    subject: `[QA-TEST] webhook shape assertion ${ts}`,
    message_id: `qa-msg-${unique('msg')}`,
    ...overrides,
  };
}

// ── Load board (Phase 5 Group 5f) ────────────────────────────────────

/**
 * Build a POST /load-board/search body (Phase 5 Group 5f test 61).
 *
 * SearchLoadsDto (search-loads.dto.ts) REQUIRES `origin` as a nested
 * {city, state, radius?} object — the nested DTO validator throws 400
 * "origin must be a non-empty object" without it. Default origin is
 * Chicago, IL which matches MOCK-DAT-001/002/003 in the DAT mock adapter
 * (dat-mock-data.ts) — guarantees a non-empty listings array in MOCK_MODE.
 *
 * `provider`, `page`, and `limit` have controller defaults ('dat', 1, 25);
 * omit unless the caller overrides.
 */
export function buildLoadBoardSearch(overrides: Record<string, unknown> = {}) {
  return {
    origin: {
      city: 'Chicago',
      state: 'IL',
      radius: 100,
    },
    ...overrides,
  };
}

/**
 * Build a POST /load-board/search/nlp body (Phase 5 Group 5f test 62).
 * NlpSearchDto requires `query` ≥ 3 chars, ≤ 500. The SearchQueryParser
 * uses the default OpenAI stub on MOCK_MODE=all — response shape is the
 * same LoadBoardSearchResult envelope as POST /search.
 */
export function buildLoadBoardNlpSearch(query: string = 'Chicago to Dallas dry van') {
  return { query };
}

/**
 * Build a POST /load-board/import body (Phase 5 Group 5f test 65).
 * ImportLoadDto fields: `{externalId: string, provider?: string}`.
 * `provider` defaults to 'dat' on the controller side.
 */
export function buildLoadBoardImport(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    provider: 'dat',
    ...overrides,
  };
}

/**
 * Build a POST /load-board/saved-searches body (Phase 5 Group 5f test 68).
 * CreateSavedSearchDto (create-saved-search.dto.ts) requires:
 *   - `name` (max 100 chars)
 *   - `searchParams` (free-form object) — NOT `criteria`
 *   - `minRate` (optional number) — NOT `notifyOnMatch`
 *
 * Default `searchParams` mirrors the minimal SearchLoadsDto shape so the
 * saved search is replayable by the polling processor.
 */
export function buildSavedSearch(overrides: Record<string, unknown> = {}) {
  return {
    name: `[QA-TEST] Saved ${unique('search')}`,
    searchParams: {
      origin: { city: 'Chicago', state: 'IL', radius: 100 },
      provider: 'dat',
    },
    ...overrides,
  };
}

export function buildTenderWebhookPayload(overrides: Record<string, unknown> = {}) {
  const ts = Date.now();
  return {
    transactionType: '204',
    senderIsaId: 'TESTBROKER01',
    payload: {
      shipmentId: `SHIP-${ts}`,
      brokerName: 'Test Broker',
      brokerReference: `BR-${ts}`,
      controlNumber: `CTL-${ts}`,
      equipmentType: 'dry_van',
      weightLbs: 42000,
      commodityType: 'Electronics',
      totalCharge: 185000,
      stops: [
        { sequence: 1, type: 'pickup', address: '100 Main St', city: 'Dallas', state: 'TX', zip: '75001' },
        { sequence: 2, type: 'delivery', address: '200 Oak Ave', city: 'Memphis', state: 'TN', zip: '38101' },
      ],
      ...(overrides.payload ?? {}),
    },
    ...overrides,
  };
}
