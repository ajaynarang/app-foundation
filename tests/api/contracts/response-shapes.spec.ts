import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * API Response Contract Tests @contract
 *
 * Validates that API response shapes haven't changed unexpectedly.
 * These catch:
 *   - Fields removed from DTOs
 *   - Type changes (string -> number)
 *   - Pagination structure changes
 *   - camelCase convention violations (SALLY mandates camelCase)
 *
 * We validate structure (keys exist, types correct) -- NOT specific values.
 *
 * Grouped by domain: Fleet, Financials, Operations, Platform, Super Admin
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Verify a list endpoint returns a valid paginated or array response */
function expectListResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  expect(body).toBeDefined();
  const obj = body as Record<string, unknown>;
  // Common pagination patterns
  const items =
    obj.data ??
    obj.items ??
    obj.results ??
    obj.drivers ??
    obj.vehicles ??
    obj.loads ??
    obj.customers ??
    obj.invoices ??
    obj.settlements ??
    obj.alerts ??
    obj.notifications ??
    obj.users ??
    obj.tenants ??
    obj.broadcasts ??
    obj.plans ??
    obj.tickets ??
    obj.subscriptions ??
    obj.notes ??
    obj.flags;
  if (items && Array.isArray(items)) return items;
  return [];
}

/** Verify camelCase convention -- no snake_case keys in response */
function expectCamelCase(obj: Record<string, unknown>, context: string): void {
  for (const key of Object.keys(obj)) {
    // Allow known exceptions: Prisma _count, id, aging buckets (days1_30 etc.)
    if (key.startsWith('_') || key === 'id') continue;
    if (/^days\d+_\d+$/.test(key) || key === 'daysOver90') continue;
    expect(!key.includes('_'), `${context}: key "${key}" uses snake_case -- SALLY mandates camelCase`).toBeTruthy();
  }
}

/** Assert an object has all expected keys */
function expectKeys(obj: Record<string, unknown>, keys: string[], context: string): void {
  for (const key of keys) {
    expect(obj, `${context}: missing key "${key}"`).toHaveProperty(key);
  }
}

/** Safely get first item from a list response, or null if empty */
function firstItemOrNull(items: unknown[]): Record<string, unknown> | null {
  return items.length > 0 ? (items[0] as Record<string, unknown>) : null;
}

// ─── Fleet Domain ───────────────────────────────────────────────────────────

test.describe('Contract: Fleet @contract', () => {
  test('GET /drivers — array of driver objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/drivers');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = expectListResponse(body);
    expect(Array.isArray(body), 'drivers endpoint returns a plain array').toBeTruthy();
    if (items.length > 0) {
      const driver = items[0] as Record<string, unknown>;
      expectKeys(
        driver,
        [
          'id',
          'driverId',
          'name',
          'licenseNumber',
          'licenseState',
          'phone',
          'status',
          'currentHos',
          'hosDataSource',
          'assignedVehicleId',
          'assignedVehicle',
          'activeLoadCounts',
          'externalDriverId',
          'externalSource',
          'lastSyncedAt',
          'sallyAccessStatus',
          'linkedUserId',
          'createdAt',
          'updatedAt',
        ],
        'driver',
      );
      expectCamelCase(driver, 'driver');
    }
  });

  test('GET /drivers — currentHos nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/drivers');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const driver = firstItemOrNull(items);
    if (driver?.currentHos) {
      const hos = driver.currentHos as Record<string, unknown>;
      expectKeys(
        hos,
        [
          'driveRemaining',
          'shiftRemaining',
          'cycleRemaining',
          'breakRemaining',
          'breakRequired',
          'dataSource',
          'lastUpdated',
        ],
        'driver.currentHos',
      );
      expectCamelCase(hos, 'driver.currentHos');
    }
  });

  test('GET /drivers — activeLoadCounts nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/drivers');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const driver = firstItemOrNull(items);
    if (driver?.activeLoadCounts) {
      const counts = driver.activeLoadCounts as Record<string, unknown>;
      expectKeys(counts, ['inTransit', 'assigned', 'onHold'], 'driver.activeLoadCounts');
      expectCamelCase(counts, 'driver.activeLoadCounts');
    }
  });

  test('GET /vehicles — array of vehicle objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/vehicles');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = expectListResponse(body);
    expect(Array.isArray(body), 'vehicles endpoint returns a plain array').toBeTruthy();
    if (items.length > 0) {
      const vehicle = items[0] as Record<string, unknown>;
      expectKeys(
        vehicle,
        [
          'id',
          'vehicleId',
          'unitNumber',
          'vin',
          'equipmentType',
          'status',
          'lifecycleStatus',
          'make',
          'model',
          'year',
          'licensePlate',
          'licensePlateState',
          'assignedDriverId',
          'assignedDriver',
          'activeLoadCounts',
          'externalVehicleId',
          'externalSource',
          'lastSyncedAt',
          'createdAt',
          'updatedAt',
          'telematics',
        ],
        'vehicle',
      );
      expectCamelCase(vehicle, 'vehicle');
    }
  });

  test('GET /loads — paginated with data/total/limit/offset', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/loads');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['data', 'total', 'limit', 'offset'], 'loads pagination');
    expect(Array.isArray(body.data)).toBeTruthy();
    const items = body.data as unknown[];
    if (items.length > 0) {
      const load = items[0] as Record<string, unknown>;
      expectKeys(
        load,
        [
          'id',
          'loadId',
          'loadNumber',
          'status',
          'customerName',
          'stopCount',
          'weightLbs',
          'commodityType',
          'equipmentType',
          'referenceNumber',
          'rateCents',
          'billingStatus',
          'pieces',
          'intakeSource',
          'pickupDate',
          'deliveryDate',
          'originCity',
          'originState',
          'destinationCity',
          'destinationState',
          'driverName',
          'vehicleUnitNumber',
          'driverPayCents',
          'payStatus',
        ],
        'load',
      );
      expectCamelCase(load, 'load');
    }
  });

  test('GET /loads — load has routePlan field', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/loads');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const items = body.data as unknown[];
    if (items.length > 0) {
      const load = items[0] as Record<string, unknown>;
      expect(load).toHaveProperty('routePlan');
    }
  });

  test('GET /customers — array of customer objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/customers');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = expectListResponse(body);
    expect(Array.isArray(body), 'customers endpoint returns a plain array').toBeTruthy();
    if (items.length > 0) {
      const customer = items[0] as Record<string, unknown>;
      expectKeys(
        customer,
        [
          'id',
          'customerId',
          'companyName',
          'customerType',
          'status',
          'contactName',
          'contactEmail',
          'contactPhone',
          'mcNumber',
          'dotNumber',
          'paymentTerms',
          'creditLimit',
          'billingEmail',
          'address',
          'city',
          'state',
          'portalAccessStatus',
          'contacts',
          'contactsCount',
          'createdAt',
          'updatedAt',
        ],
        'customer',
      );
      expectCamelCase(customer, 'customer');
    }
  });

  test('GET /recurring-lanes — paginated with data/total/limit/offset', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/recurring-lanes');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['data', 'total', 'limit', 'offset'], 'recurring-lanes pagination');
    const items = body.data as unknown[];
    if (items.length > 0) {
      const lane = items[0] as Record<string, unknown>;
      expectKeys(
        lane,
        [
          'id',
          'laneId',
          'name',
          'customerId',
          'customerName',
          'equipmentType',
          'commodityType',
          'rateCents',
          'scheduleType',
          'scheduleDays',
          'autoCreate',
          'originCity',
          'originState',
          'destinationCity',
          'destinationState',
          'status',
          'effectiveFrom',
          'effectiveUntil',
          'totalLoadsGenerated',
          'stops',
          'createdAt',
          'updatedAt',
        ],
        'recurring-lane',
      );
      expectCamelCase(lane, 'recurring-lane');
    }
  });

  test('GET /recurring-lanes — stops nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/recurring-lanes');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const items = body.data as unknown[];
    const lane = firstItemOrNull(items);
    if (lane?.stops && Array.isArray(lane.stops) && (lane.stops as unknown[]).length > 0) {
      const stop = (lane.stops as Record<string, unknown>[])[0];
      expectKeys(
        stop,
        ['id', 'laneId', 'sequenceOrder', 'actionType', 'stopName', 'stopCity', 'stopState'],
        'recurring-lane.stop',
      );
    }
  });
});

// ─── Financials Domain ──────────────────────────────────────────────────────

test.describe('Contract: Financials @contract', () => {
  test('GET /invoices — array of invoice objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = expectListResponse(body);
    expect(Array.isArray(body), 'invoices endpoint returns a plain array').toBeTruthy();
    if (items.length > 0) {
      const invoice = items[0] as Record<string, unknown>;
      expectKeys(
        invoice,
        [
          'id',
          'invoiceNumber',
          'status',
          'customerId',
          'loadId',
          'subtotalCents',
          'adjustmentCents',
          'totalCents',
          'paidCents',
          'balanceCents',
          'issueDate',
          'dueDate',
          'paymentTermsDays',
          'customer',
          'load',
          'lineItems',
          'createdAt',
          'updatedAt',
        ],
        'invoice',
      );
      expectCamelCase(invoice, 'invoice');
    }
  });

  test('GET /invoices — lineItems nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const invoice = firstItemOrNull(items);
    if (invoice?.lineItems && Array.isArray(invoice.lineItems) && (invoice.lineItems as unknown[]).length > 0) {
      const li = (invoice.lineItems as Record<string, unknown>[])[0];
      expectKeys(
        li,
        ['id', 'invoiceId', 'type', 'description', 'quantity', 'unitPriceCents', 'totalCents', 'sequenceOrder'],
        'invoice.lineItem',
      );
      expectCamelCase(li, 'invoice.lineItem');
    }
  });

  test('GET /invoices — nested customer has companyName', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const invoice = firstItemOrNull(items);
    if (invoice?.customer) {
      const cust = invoice.customer as Record<string, unknown>;
      expectKeys(cust, ['id', 'customerId', 'companyName'], 'invoice.customer');
    }
  });

  test('GET /invoices — nested load has loadNumber', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const invoice = firstItemOrNull(items);
    if (invoice?.load) {
      const load = invoice.load as Record<string, unknown>;
      expectKeys(load, ['loadNumber', 'loadId'], 'invoice.load');
    }
  });

  test('GET /invoices/summary — aggregate summary shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices/summary');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(
      body,
      [
        'outstandingCents',
        'overdueCents',
        'dueThisWeekCents',
        'dueThisWeekCount',
        'paidThisMonthCents',
        'draftCount',
        'readyToInvoiceCount',
        'factoredCents',
        'factoredCount',
        'aging',
      ],
      'invoices/summary',
    );
    expectCamelCase(body, 'invoices/summary');
  });

  test('GET /invoices/summary — aging buckets shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices/summary');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const aging = body.aging as Record<string, unknown>;
    expect(aging).toBeDefined();
    expectKeys(aging, ['current', 'days1_30', 'days31_60', 'days61_90', 'daysOver90'], 'aging');
  });

  test('GET /settlements — array of settlement objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/settlements');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = expectListResponse(body);
    expect(Array.isArray(body), 'settlements endpoint returns a plain array').toBeTruthy();
    if (items.length > 0) {
      const settlement = items[0] as Record<string, unknown>;
      expectKeys(
        settlement,
        [
          'id',
          'settlementId',
          'settlementNumber',
          'status',
          'driverId',
          'periodStart',
          'periodEnd',
          'grossPayCents',
          'deductionsCents',
          'netPayCents',
          'driver',
          'lineItems',
          'deductions',
          'createdAt',
          'updatedAt',
        ],
        'settlement',
      );
      expectCamelCase(settlement, 'settlement');
    }
  });

  test('GET /settlements — lineItems nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/settlements');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const settlement = firstItemOrNull(items);
    if (
      settlement?.lineItems &&
      Array.isArray(settlement.lineItems) &&
      (settlement.lineItems as unknown[]).length > 0
    ) {
      const li = (settlement.lineItems as Record<string, unknown>[])[0];
      expectKeys(
        li,
        [
          'id',
          'settlementId',
          'loadId',
          'description',
          'miles',
          'loadRevenueCents',
          'payAmountCents',
          'payStructureType',
        ],
        'settlement.lineItem',
      );
      expectCamelCase(li, 'settlement.lineItem');
    }
  });

  test('GET /settlements — deductions nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/settlements');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const settlement = firstItemOrNull(items);
    if (
      settlement?.deductions &&
      Array.isArray(settlement.deductions) &&
      (settlement.deductions as unknown[]).length > 0
    ) {
      const ded = (settlement.deductions as Record<string, unknown>[])[0];
      expectKeys(ded, ['id', 'settlementId', 'type', 'description', 'amountCents'], 'settlement.deduction');
      expectCamelCase(ded, 'settlement.deduction');
    }
  });

  test('GET /settlements — nested driver has driverId and name', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/settlements');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const settlement = firstItemOrNull(items);
    if (settlement?.driver) {
      const driver = settlement.driver as Record<string, unknown>;
      expectKeys(driver, ['driverId', 'name'], 'settlement.driver');
    }
  });

  test('GET /settlements/summary — aggregate summary shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/settlements/summary');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(
      body,
      [
        'pendingApproval',
        'pendingApprovalCents',
        'readyToPay',
        'readyToPayCents',
        'paidThisMonthCents',
        'activeDrivers',
        'avgSettlementCents',
      ],
      'settlements/summary',
    );
    expectCamelCase(body, 'settlements/summary');
  });

  test('GET /close-out — paginated loads with charges', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/close-out');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['loads', 'total'], 'close-out');
    const loads = body.loads as unknown[];
    expect(Array.isArray(loads)).toBeTruthy();
    if (loads.length > 0) {
      const load = loads[0] as Record<string, unknown>;
      expectKeys(
        load,
        [
          'id',
          'loadId',
          'loadNumber',
          'status',
          'billingStatus',
          'customerName',
          'customerId',
          'rateCents',
          'chargeTotalCents',
          'originCity',
          'originState',
          'destinationCity',
          'destinationState',
          'deliveredAt',
          'driverName',
          'driverId',
          'vehicleNumber',
          'stops',
          'charges',
        ],
        'close-out.load',
      );
      expectCamelCase(load, 'close-out.load');
    }
  });

  test('GET /close-out — charges nested shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/close-out');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const loads = body.loads as Record<string, unknown>[];
    const load = loads?.length > 0 ? loads[0] : null;
    if (load?.charges && Array.isArray(load.charges) && (load.charges as unknown[]).length > 0) {
      const charge = (load.charges as Record<string, unknown>[])[0];
      expectKeys(
        charge,
        ['id', 'chargeType', 'description', 'quantity', 'unitPriceCents', 'totalCents', 'isBillable', 'isPayable'],
        'close-out.charge',
      );
      expectCamelCase(charge, 'close-out.charge');
    }
  });

  test('GET /close-out/summary — billing pipeline summary', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/close-out/summary');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(
      body,
      ['needsDocs', 'readyForReview', 'readyToBill', 'readyToBillTotalCents', 'overduePods', 'total'],
      'close-out/summary',
    );
    expectCamelCase(body, 'close-out/summary');
  });

  test('GET /profitability/loads — array of profitability rows', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/profitability/loads');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'profitability/loads returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const row = items[0] as Record<string, unknown>;
      expectKeys(
        row,
        ['loadId', 'loadNumber', 'revenueCents', 'driverCostCents', 'fuelCostCents', 'marginCents', 'marginPercent'],
        'profitability.load',
      );
      expectCamelCase(row, 'profitability.load');
    }
  });

  test('GET /billing/overview — subscription, wallet, paymentMethods', async ({ asAdmin }) => {
    const res = await asAdmin.get('/billing/overview');
    // Billing may 403/500 if Stripe is not configured
    if (!res.ok()) {
      test.skip(true, `billing/overview returned ${res.status()} — Stripe may not be configured`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['subscription', 'wallet', 'paymentMethods', 'upcomingInvoice'], 'billing/overview');
  });

  test('GET /billing/overview — subscription nested shape', async ({ asAdmin }) => {
    const res = await asAdmin.get('/billing/overview');
    if (!res.ok()) {
      test.skip(true, `billing/overview returned ${res.status()}`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    if (body.subscription) {
      const sub = body.subscription as Record<string, unknown>;
      expectKeys(
        sub,
        [
          'id',
          'tenantId',
          'plan',
          'status',
          'quantity',
          'unitPriceCents',
          'interval',
          'currentPeriodStart',
          'currentPeriodEnd',
          'createdAt',
          'updatedAt',
        ],
        'billing.subscription',
      );
      expectCamelCase(sub, 'billing.subscription');
    }
  });

  test('GET /billing/wallet — wallet balance and transactions', async ({ asAdmin }) => {
    const res = await asAdmin.get('/billing/wallet');
    if (!res.ok()) {
      test.skip(true, `billing/wallet returned ${res.status()}`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['wallet', 'recentTransactions'], 'billing/wallet');
    if (body.wallet) {
      const wallet = body.wallet as Record<string, unknown>;
      expectKeys(
        wallet,
        [
          'id',
          'tenantId',
          'balanceCents',
          'autoReloadEnabled',
          'autoReloadThresholdCents',
          'autoReloadAmountCents',
          'lifetimeLoadedCents',
          'lifetimeConsumedCents',
          'createdAt',
          'updatedAt',
        ],
        'billing.wallet',
      );
      expectCamelCase(wallet, 'billing.wallet');
    }
  });

  test('GET /billing/wallet — recentTransactions nested shape', async ({ asAdmin }) => {
    const res = await asAdmin.get('/billing/wallet');
    if (!res.ok()) {
      test.skip(true, `billing/wallet returned ${res.status()}`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    const txns = body.recentTransactions as unknown[];
    if (txns && txns.length > 0) {
      const txn = txns[0] as Record<string, unknown>;
      expectKeys(
        txn,
        ['id', 'walletId', 'tenantId', 'type', 'amountCents', 'balanceAfterCents', 'description', 'createdAt'],
        'billing.walletTransaction',
      );
      expectCamelCase(txn, 'billing.walletTransaction');
    }
  });

  test('GET /billing/payment-methods — array of payment methods', async ({ asAdmin }) => {
    const res = await asAdmin.get('/billing/payment-methods');
    if (!res.ok()) {
      test.skip(true, `billing/payment-methods returned ${res.status()}`);
      return;
    }
    const body = await res.json();
    expect(Array.isArray(body), 'payment-methods returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const pm = items[0] as Record<string, unknown>;
      expectKeys(
        pm,
        [
          'id',
          'tenantId',
          'providerPaymentMethodId',
          'type',
          'last4',
          'brand',
          'expMonth',
          'expYear',
          'isDefault',
          'createdAt',
          'updatedAt',
        ],
        'paymentMethod',
      );
      expectCamelCase(pm, 'paymentMethod');
    }
  });
});

// ─── Operations Domain ──────────────────────────────────────────────────────

test.describe('Contract: Operations @contract', () => {
  test('GET /alerts — array of alert objects', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/alerts');
    if (res.status() === 403) {
      test.skip(true, 'Alerts feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'alerts endpoint returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const alert = items[0] as Record<string, unknown>;
      expectKeys(
        alert,
        [
          'alertId',
          'alertType',
          'category',
          'priority',
          'title',
          'message',
          'recommendedAction',
          'status',
          'scope',
          'driverId',
          'loadId',
          'vehicleId',
          'acknowledgedAt',
          'resolvedAt',
          'escalationLevel',
          'occurrenceCount',
          'createdAt',
          'updatedAt',
        ],
        'alert',
      );
      expectCamelCase(alert, 'alert');
    }
  });

  test('GET /alerts — status and priority are strings', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/alerts');
    if (res.status() === 403) {
      test.skip(true, 'Alerts feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const alert = firstItemOrNull(items);
    if (alert) {
      expect(typeof alert.status).toBe('string');
      expect(typeof alert.priority).toBe('string');
      expect(typeof alert.category).toBe('string');
    }
  });

  test('GET /notifications — paginated with data/total', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/notifications');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['data', 'total'], 'notifications pagination');
    const items = body.data as unknown[];
    expect(Array.isArray(items)).toBeTruthy();
    if (items.length > 0) {
      const notif = items[0] as Record<string, unknown>;
      expectKeys(
        notif,
        [
          'id',
          'notificationId',
          'type',
          'channel',
          'recipient',
          'status',
          'category',
          'title',
          'message',
          'actionUrl',
          'actionLabel',
          'iconType',
          'readAt',
          'dismissedAt',
          'createdAt',
          'updatedAt',
        ],
        'notification',
      );
      expectCamelCase(notif, 'notification');
    }
  });

  test('GET /notifications/count — count by category', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/notifications/count');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['total', 'system', 'team', 'billing'], 'notifications/count');
    expect(typeof body.total).toBe('number');
    expect(typeof body.system).toBe('number');
    expect(typeof body.team).toBe('number');
    expect(typeof body.billing).toBe('number');
  });

  test('GET /command-center/overview — kpis, activeLoads, quickActionCounts, driverHosStrip', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/overview');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['kpis', 'activeLoads', 'quickActionCounts', 'driverHosStrip'], 'command-center/overview');
  });

  test('GET /command-center/overview — kpis shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/command-center/overview');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const kpis = body.kpis as Record<string, unknown>;
    expectKeys(
      kpis,
      ['activeLoads', 'inTransit', 'onTimePercentage', 'activeAlerts', 'unassigned'],
      'command-center.kpis',
    );
    expectCamelCase(kpis, 'command-center.kpis');
  });

  test('GET /command-center/overview — quickActionCounts shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/command-center/overview');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const qac = body.quickActionCounts as Record<string, unknown>;
    expectKeys(qac, ['unassignedLoads', 'availableDrivers'], 'command-center.quickActionCounts');
    expectCamelCase(qac, 'command-center.quickActionCounts');
  });

  test('GET /command-center/overview — activeLoads item shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/command-center/overview');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const loads = body.activeLoads as unknown[];
    if (loads && loads.length > 0) {
      const load = loads[0] as Record<string, unknown>;
      expectKeys(
        load,
        [
          'loadId',
          'loadNumber',
          'customerName',
          'status',
          'origin',
          'destination',
          'driver',
          'vehicle',
          'stopProgress',
          'pickupDate',
          'deliveryDate',
          'rateCents',
          'activeAlertCount',
          'updatedAt',
        ],
        'command-center.activeLoad',
      );
    }
  });

  test('GET /command-center/overview — driverHosStrip item shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/command-center/overview');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const strip = body.driverHosStrip as unknown[];
    if (strip && strip.length > 0) {
      const driver = strip[0] as Record<string, unknown>;
      expectKeys(
        driver,
        ['driverId', 'name', 'initials', 'driveHoursRemaining', 'dutyHoursRemaining', 'status'],
        'command-center.driverHosStrip',
      );
      expectCamelCase(driver, 'command-center.driverHosStrip');
    }
  });

  test('GET /command-center/shift-notes — notes and handoffStatus', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/command-center/shift-notes');
    if (res.status() === 403) {
      test.skip(true, 'Command center feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['notes', 'handoffStatus'], 'command-center/shift-notes');
    expect(Array.isArray(body.notes)).toBeTruthy();
    const handoff = body.handoffStatus as Record<string, unknown>;
    expect(handoff).toBeDefined();
    expectKeys(handoff, ['acknowledged'], 'shift-notes.handoffStatus');
  });

  test('GET /shield/score — compliance score (feature-gated)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/shield/score');
    if (res.status() === 403) {
      test.skip(true, 'Shield feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('overallScore');
    expect(typeof body.overallScore).toBe('number');
    expect(body).toHaveProperty('statusLabel');
  });

  test('GET /shield/findings — compliance findings (feature-gated)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/shield/findings');
    if (res.status() === 403) {
      test.skip(true, 'Shield feature not enabled');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Findings can be array or paginated
    expect(body).toBeDefined();
  });

  test('GET /analytics/kpi — dashboard KPI snapshot', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/analytics/kpi');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(
      body,
      [
        'todayRevenueCents',
        'mtdRevenueCents',
        'activeLoads',
        'onTimePercent',
        'fleetUtilizationPercent',
        'arOutstandingCents',
        'shieldScore',
        'mtdMarginPercent',
      ],
      'analytics/kpi',
    );
    expectCamelCase(body, 'analytics/kpi');
  });

  test('GET /analytics/kpi — all values are numbers', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/analytics/kpi');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of ['todayRevenueCents', 'mtdRevenueCents', 'activeLoads', 'onTimePercent']) {
      expect(typeof body[key], `analytics/kpi.${key} should be a number`).toBe('number');
    }
  });

  test('GET /routes — paginated plans with total/limit/offset', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/routes');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['plans', 'total', 'limit', 'offset'], 'routes pagination');
    expect(Array.isArray(body.plans)).toBeTruthy();
    expect(typeof body.total).toBe('number');
  });
});

// ─── Platform Domain ────────────────────────────────────────────────────────

test.describe('Contract: Platform @contract', () => {
  test('GET /users — array of user objects (ADMIN)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/users');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'users endpoint returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const user = items[0] as Record<string, unknown>;
      expectKeys(
        user,
        [
          'userId',
          'email',
          'firstName',
          'lastName',
          'role',
          'isActive',
          'emailVerified',
          'createdAt',
          'lastLoginAt',
          'tenant',
          'driver',
        ],
        'user',
      );
      expectCamelCase(user, 'user');
      expect(typeof user.role).toBe('string');
    }
  });

  test('GET /invitations — array (ADMIN)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/invitations');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'invitations endpoint returns a plain array').toBeTruthy();
    // May be empty — that is valid
  });

  test('GET /feature-flags — object with flags array', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/feature-flags');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['flags'], 'feature-flags');
    const flags = body.flags as unknown[];
    expect(Array.isArray(flags)).toBeTruthy();
    if (flags.length > 0) {
      const flag = flags[0] as Record<string, unknown>;
      expectKeys(flag, ['key', 'name', 'description', 'enabled', 'category'], 'featureFlag');
      expect(typeof flag.key).toBe('string');
      expect(typeof flag.enabled).toBe('boolean');
      expectCamelCase(flag, 'featureFlag');
    }
  });

  test('GET /plans — array of available plans', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/plans');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'plans endpoint returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const plan = items[0] as Record<string, unknown>;
      expectKeys(
        plan,
        [
          'id',
          'plan',
          'displayName',
          'tagline',
          'pricePerUnit',
          'unitLabel',
          'fleetLimit',
          'userLimit',
          'isPopular',
          'ctaLabel',
          'displayOrder',
          'isActive',
          'entitlements',
          'createdAt',
          'updatedAt',
        ],
        'plan',
      );
      expectCamelCase(plan, 'plan');
    }
  });

  test('GET /plans/my-plan — current tenant plan details', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/plans/my-plan');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(
      body,
      ['plan', 'planAssignedAt', 'planConfig', 'vehicleCount', 'fleetLimit', 'planEvents'],
      'plans/my-plan',
    );
    expect(Array.isArray(body.planEvents)).toBeTruthy();
  });

  test('GET /plans/my-plan — planEvents item shape', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/plans/my-plan');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const events = body.planEvents as unknown[];
    if (events && events.length > 0) {
      const evt = events[0] as Record<string, unknown>;
      expectKeys(evt, ['id', 'tenantId', 'fromPlan', 'toPlan', 'changedBy', 'reason', 'createdAt'], 'planEvent');
      expectCamelCase(evt, 'planEvent');
    }
  });

  test('GET /add-ons — array of available add-ons', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/add-ons');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'add-ons endpoint returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const addon = items[0] as Record<string, unknown>;
      expectKeys(
        addon,
        [
          'id',
          'slug',
          'name',
          'description',
          'icon',
          'category',
          'priceCents',
          'billingInterval',
          'featureKey',
          'usageLimits',
          'usageLimitUnit',
          'overageRateCents',
          'isActive',
          'displayOrder',
        ],
        'addOn',
      );
      expectCamelCase(addon, 'addOn');
    }
  });

  test('GET /add-ons/my-add-ons — tenant add-on subscriptions (ADMIN)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/add-ons/my-add-ons');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'my-add-ons returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const sub = items[0] as Record<string, unknown>;
      expectKeys(
        sub,
        [
          'id',
          'tenantId',
          'addOnId',
          'status',
          'source',
          'priceCents',
          'usageLimit',
          'usageLimitUnit',
          'currentUsage',
          'overageUsage',
          'allowOverage',
          'activatedAt',
          'activatedBy',
          'addOn',
          'createdAt',
          'updatedAt',
        ],
        'myAddOn',
      );
      expectCamelCase(sub, 'myAddOn');
      // Verify nested addOn
      if (sub.addOn) {
        const nested = sub.addOn as Record<string, unknown>;
        expectKeys(nested, ['id', 'slug', 'name', 'priceCents'], 'myAddOn.addOn');
      }
    }
  });

  test('GET /webhooks — subscriptions and total', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/webhooks');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['subscriptions', 'total'], 'webhooks');
    expect(Array.isArray(body.subscriptions)).toBeTruthy();
    expect(typeof body.total).toBe('number');
  });

  test('GET /api-keys — array', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/api-keys');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'api-keys returns a plain array').toBeTruthy();
  });

  test('GET /feedback — array', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/feedback');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'feedback returns a plain array').toBeTruthy();
  });

  test('GET /support/tickets — paginated tickets', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/support/tickets');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['tickets', 'total', 'limit', 'offset'], 'support/tickets pagination');
    const tickets = body.tickets as unknown[];
    expect(Array.isArray(tickets)).toBeTruthy();
    if (tickets.length > 0) {
      const ticket = tickets[0] as Record<string, unknown>;
      expectKeys(
        ticket,
        [
          'id',
          'ticketNumber',
          'subject',
          'description',
          'category',
          'priority',
          'status',
          'aiResolved',
          'messageCount',
          'createdBy',
          'createdAt',
          'updatedAt',
        ],
        'support.ticket',
      );
      expectCamelCase(ticket, 'support.ticket');
    }
  });

  test('GET /integrations — array of integration configs (ADMIN)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'integrations returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const integration = items[0] as Record<string, unknown>;
      expectKeys(
        integration,
        ['id', 'integrationType', 'vendor', 'displayName', 'isEnabled', 'status', 'createdAt', 'updatedAt'],
        'integration',
      );
      expectCamelCase(integration, 'integration');
    }
  });

  test('GET /integrations/vendors — array of vendor definitions (ADMIN)', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations/vendors');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'vendors returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const vendor = items[0] as Record<string, unknown>;
      expectKeys(
        vendor,
        ['id', 'displayName', 'description', 'integrationType', 'connectionMethods', 'helpUrl', 'displayOrder'],
        'integrationVendor',
      );
      expectCamelCase(vendor, 'integrationVendor');
    }
  });
});

// ─── Super Admin Domain ─────────────────────────────────────────────────────

test.describe('Contract: Super Admin @contract', () => {
  test('GET /tenants — array of tenant objects', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/tenants');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'tenants endpoint returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const tenant = items[0] as Record<string, unknown>;
      expectKeys(
        tenant,
        [
          'id',
          'tenantId',
          'companyName',
          'subdomain',
          'contactEmail',
          'status',
          'dotNumber',
          'carrierType',
          'mcNumber',
          'fleetSize',
          'isActive',
          'plan',
          'trialStartedAt',
          'trialEndsAt',
          'onboardingCompletedAt',
          'onboardingProgress',
          'users',
          '_count',
          'createdAt',
          'updatedAt',
        ],
        'tenant',
      );
      // _count is a Prisma aggregate — allowed exception to camelCase
    }
  });

  test('GET /tenants — _count has users and drivers', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/tenants');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const tenant = firstItemOrNull(items);
    if (tenant?._count) {
      const count = tenant._count as Record<string, unknown>;
      expectKeys(count, ['users', 'drivers'], 'tenant._count');
    }
  });

  test('GET /admin/broadcasts — array', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/broadcasts');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'broadcasts returns a plain array').toBeTruthy();
  });

  test('GET /admin/feedback — paginated with data/total/page/limit', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/feedback');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['data', 'total', 'page', 'limit'], 'admin/feedback pagination');
    const items = body.data as unknown[];
    expect(Array.isArray(items)).toBeTruthy();
    if (items.length > 0) {
      const fb = items[0] as Record<string, unknown>;
      expectKeys(
        fb,
        [
          'id',
          'tenantId',
          'userId',
          'category',
          'sentiment',
          'message',
          'page',
          'status',
          'user',
          'tenant',
          'createdAt',
          'updatedAt',
        ],
        'admin.feedback',
      );
      expectCamelCase(fb, 'admin.feedback');
    }
  });

  test('GET /admin/feedback — nested user shape', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/feedback');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const items = body.data as unknown[];
    const fb = firstItemOrNull(items);
    if (fb?.user) {
      const user = fb.user as Record<string, unknown>;
      expectKeys(user, ['id', 'firstName', 'lastName', 'email', 'role'], 'admin.feedback.user');
    }
  });

  test('GET /admin/feedback/stats — aggregate stats', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/feedback/stats');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expectKeys(body, ['total', 'new', 'reviewed', 'resolved', 'bySentiment'], 'admin/feedback/stats');
    expect(typeof body.total).toBe('number');
    expect(typeof body.new).toBe('number');
    expect(typeof body.reviewed).toBe('number');
    expect(typeof body.resolved).toBe('number');
    expect(Array.isArray(body.bySentiment)).toBeTruthy();
  });

  test('GET /admin/feedback/stats — bySentiment item shape', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/feedback/stats');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const sentiments = body.bySentiment as unknown[];
    if (sentiments && sentiments.length > 0) {
      const item = sentiments[0] as Record<string, unknown>;
      expectKeys(item, ['sentiment', 'count'], 'feedbackStats.bySentiment');
      expect(typeof item.count).toBe('number');
    }
  });

  test('GET /admin/add-ons — array of all add-ons with timestamps', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/add-ons');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'admin/add-ons returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const addon = items[0] as Record<string, unknown>;
      expectKeys(
        addon,
        [
          'id',
          'slug',
          'name',
          'description',
          'icon',
          'category',
          'priceCents',
          'billingInterval',
          'featureKey',
          'usageLimits',
          'usageLimitUnit',
          'overageRateCents',
          'isActive',
          'displayOrder',
          'createdAt',
          'updatedAt',
        ],
        'admin.addOn',
      );
      expectCamelCase(addon, 'admin.addOn');
    }
  });

  test('GET /admin/add-on-requests — array of add-on requests', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/add-on-requests');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body), 'admin/add-on-requests returns a plain array').toBeTruthy();
    const items = body as unknown[];
    if (items.length > 0) {
      const req = items[0] as Record<string, unknown>;
      expectKeys(
        req,
        [
          'id',
          'tenantId',
          'addOnId',
          'status',
          'requestedByUserId',
          'requestedAt',
          'requestNote',
          'addOn',
          'tenant',
          'addOnActive',
          'createdAt',
          'updatedAt',
        ],
        'addOnRequest',
      );
      expectCamelCase(req, 'addOnRequest');
    }
  });

  test('GET /admin/add-on-requests — nested addOn and tenant shapes', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/admin/add-on-requests');
    expect(res.ok()).toBeTruthy();
    const items = expectListResponse(await res.json());
    const req = firstItemOrNull(items);
    if (req?.addOn) {
      const addon = req.addOn as Record<string, unknown>;
      expectKeys(addon, ['id', 'slug', 'name', 'priceCents'], 'addOnRequest.addOn');
    }
    if (req?.tenant) {
      const tenant = req.tenant as Record<string, unknown>;
      expectKeys(tenant, ['id', 'tenantId', 'companyName'], 'addOnRequest.tenant');
    }
  });
});
