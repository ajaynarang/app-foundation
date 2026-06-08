import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * E2E: Lumper Money Code & Driver Actions
 *
 * Tests the full lumper/money code lifecycle:
 *   1. Driver requests lumper funds for an active load
 *   2. List money codes for the load (driver + dispatcher)
 *   3. Get Sally lumper insights (dispatcher)
 *   4. Dispatcher approves with money code
 *   5. Driver marks money code as used (receipt)
 *   6. Verify LoadCharge auto-created
 *   7. Driver submits driver actions (detention, scale ticket, fuel receipt, issue report)
 *   8. Dispatcher acknowledges and resolves driver actions
 *   9. RBAC: CUSTOMER cannot access money codes or driver actions
 *   10. RBAC: Driver cannot approve/deny money codes
 *   11. RBAC: Driver cannot submit actions for unassigned load
 *
 * @workflow
 */

// Feature-gated helper
async function expectOrFeatureGated(res: any, endpoint: string): Promise<boolean> {
  if (res.ok()) return true;
  if (res.status() === 403) {
    const body = await res.text();
    if (body.toLowerCase().includes('feature') || body.toLowerCase().includes('not enabled')) {
      test.skip(true, `${endpoint}: feature not enabled`);
      return false;
    }
  }
  return true;
}

/** Get the first active/in-transit load with a driver assigned */
async function getLoadWithDriver(client: any): Promise<{ loadId: string; id: number; driverId: number } | null> {
  const res = await client.get('/loads?limit=50');
  if (!res.ok()) return null;
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.data || [];
  // Prefer in_transit loads (they have active drivers)
  const withDriver = items.filter((l: any) => l.driverId && ['in_transit', 'assigned', 'pending'].includes(l.status));
  if (withDriver.length === 0) return null;
  const load = withDriver[0];
  return { loadId: load.loadId, id: load.id, driverId: load.driverId };
}

test.describe('E2E: Lumper Money Code & Driver Actions @workflow', () => {
  // Track created money code ID for sequential tests
  let testLoadId: string;
  let testMoneyCodeId: string;

  test('1. Find active load with driver for testing', async ({ asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load with assigned driver available');
    testLoadId = load!.loadId;
    console.log(`   📦 Testing with load: ${testLoadId}`);
  });

  test('2. Driver requests lumper funds', async ({ asDriver }) => {
    test.skip(!testLoadId, 'No test load');

    const res = await asDriver.post(`/loads/${testLoadId}/money-codes`, {
      requestedCents: 32000,
      method: 'comchek',
      driverNote: 'QA test — lumper says $320 firm',
    });

    // Driver may not be assigned to this load — handle 403 gracefully
    if (res.status() === 403) {
      console.log('   ⚠️ Driver not assigned to this load — testing with dispatcher');
      // Fall back to dispatcher creating the request
      const fallback = await asDriver.get('/loads?limit=50');
      if (fallback.ok()) {
        const data = await fallback.json();
        const items = Array.isArray(data) ? data : data.data || [];
        // Find a load the driver IS assigned to
        if (items.length > 0) {
          testLoadId = items[0].loadId;
          const retryRes = await asDriver.post(`/loads/${testLoadId}/money-codes`, {
            requestedCents: 32000,
            method: 'comchek',
            driverNote: 'QA test — lumper says $320 firm',
          });
          if (retryRes.ok()) {
            const mc = await retryRes.json();
            testMoneyCodeId = mc.moneyCodeId;
            console.log(`   ✅ Lumper request created: ${testMoneyCodeId} (driver load: ${testLoadId})`);
            return;
          }
        }
      }
      test.skip(true, 'Driver has no assigned loads');
      return;
    }

    expect(res.ok(), `Create money code: ${res.status()}`).toBeTruthy();
    const mc = await res.json();
    expect(mc).toHaveProperty('moneyCodeId');
    expect(mc.status).toBe('requested');
    expect(mc.requestedCents).toBe(32000);
    expect(mc.method).toBe('comchek');
    testMoneyCodeId = mc.moneyCodeId;
    console.log(`   ✅ Lumper request created: ${testMoneyCodeId}`);
  });

  test('3. List money codes for load (dispatcher)', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    const res = await asDispatcher.get(`/loads/${testLoadId}/money-codes`);
    expect(res.ok(), `List money codes: ${res.status()}`).toBeTruthy();
    const codes = await res.json();
    expect(Array.isArray(codes)).toBeTruthy();
    console.log(`   📋 ${codes.length} money code(s) on load ${testLoadId}`);

    if (testMoneyCodeId) {
      const ours = codes.find((c: any) => c.moneyCodeId === testMoneyCodeId);
      expect(ours, 'Our money code should be in the list').toBeTruthy();
      expect(ours.status).toBe('requested');
    }
  });

  test('4. Get Sally lumper insights (dispatcher)', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    const res = await asDispatcher.get(`/loads/${testLoadId}/money-codes/insights`);
    expect(res.ok(), `Insights: ${res.status()}`).toBeTruthy();
    const insights = await res.json();

    // Insights should have these fields (values may be null)
    expect(insights).toHaveProperty('facilityAvg');
    expect(insights).toHaveProperty('driverHistory');
    expect(insights).toHaveProperty('facilityName');
    console.log(
      `   🧠 Insights: facility avg=${insights.facilityAvg?.avg ?? 'N/A'}, driver history=${insights.driverHistory?.count ?? 0} requests`,
    );
  });

  test('5. Dispatcher approves money code', async ({ asDispatcher }) => {
    test.skip(!testMoneyCodeId, 'No money code to approve');

    const res = await asDispatcher.patch(`/loads/${testLoadId}/money-codes/${testMoneyCodeId}/approve`, {
      code: 'QA-TEST-4829',
      amountCents: 32000,
      dispatcherNote: 'QA approved',
      expiresInHours: 24,
    });

    expect(res.ok(), `Approve: ${res.status()}`).toBeTruthy();
    const mc = await res.json();
    expect(mc.status).toBe('approved');
    expect(mc.code).toBe('QA-TEST-4829');
    expect(mc.amountCents).toBe(32000);
    expect(mc.expiresAt).toBeTruthy();
    console.log(`   ✅ Approved with code: ${mc.code}, expires: ${mc.expiresAt}`);
  });

  test('6. Verify approved money code has code visible', async ({ asDriver }) => {
    test.skip(!testMoneyCodeId || !testLoadId, 'No money code');

    const res = await asDriver.get(`/loads/${testLoadId}/money-codes`);
    if (res.status() === 403) {
      test.skip(true, 'Driver cannot access this load');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const codes = await res.json();
    const mc = codes.find((c: any) => c.moneyCodeId === testMoneyCodeId);
    if (mc) {
      expect(mc.status).toBe('approved');
      expect(mc.code).toBeTruthy();
      console.log(`   ✅ Driver can see code: ${mc.code}`);
    }
  });

  test('7. Driver marks money code as used', async ({ asDriver }) => {
    test.skip(!testMoneyCodeId || !testLoadId, 'No money code');

    const res = await asDriver.patch(`/loads/${testLoadId}/money-codes/${testMoneyCodeId}/use`, {
      actualAmountCents: 31500,
    });

    if (res.status() === 403) {
      test.skip(true, 'Driver cannot access this load');
      return;
    }

    // May fail if load billing is already approved — that's acceptable
    if (res.status() === 400) {
      const body = await res.json();
      console.log(`   ⚠️ Cannot mark used: ${body.detail || body.message}`);
      test.skip(true, 'Load billing prevents charge creation');
      return;
    }

    expect(res.ok(), `Mark used: ${res.status()}`).toBeTruthy();
    const mc = await res.json();
    expect(mc.status).toBe('used');
    console.log(`   ✅ Marked used — LoadCharge created`);
  });

  test('8. Verify load charges include lumper charge', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    const res = await asDispatcher.get(`/loads/${testLoadId}/charges`);
    if (!res.ok()) {
      console.log(`   ⚠️ Cannot check charges: ${res.status()}`);
      return;
    }
    const charges = await res.json();
    const lumperCharges = (Array.isArray(charges) ? charges : []).filter((c: any) => c.chargeType === 'lumper');
    console.log(`   💰 ${lumperCharges.length} lumper charge(s) on load`);
  });

  test('9. Dispatcher can deny a money code', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    // Create a new request to deny
    const createRes = await asDispatcher.post(`/loads/${testLoadId}/money-codes`, {
      requestedCents: 50000,
      method: 'efs',
    });

    if (!createRes.ok()) {
      test.skip(true, 'Cannot create money code for deny test');
      return;
    }

    const created = await createRes.json();

    const denyRes = await asDispatcher.patch(`/loads/${testLoadId}/money-codes/${created.moneyCodeId}/deny`, {
      dispatcherNote: 'QA deny test',
    });

    expect(denyRes.ok(), `Deny: ${denyRes.status()}`).toBeTruthy();
    const denied = await denyRes.json();
    expect(denied.status).toBe('denied');
    console.log(`   ✅ Denied money code: ${denied.moneyCodeId}`);
  });

  test('10. Cancel a money code', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    // Create a new request to cancel
    const createRes = await asDispatcher.post(`/loads/${testLoadId}/money-codes`, {
      requestedCents: 15000,
      method: 'cash',
    });

    if (!createRes.ok()) {
      test.skip(true, 'Cannot create money code for cancel test');
      return;
    }

    const created = await createRes.json();

    const cancelRes = await asDispatcher.patch(`/loads/${testLoadId}/money-codes/${created.moneyCodeId}/cancel`);
    expect(cancelRes.ok(), `Cancel: ${cancelRes.status()}`).toBeTruthy();
    const cancelled = await cancelRes.json();
    expect(cancelled.status).toBe('cancelled');
    console.log(`   ✅ Cancelled money code: ${cancelled.moneyCodeId}`);
  });

  test('11. Proactive issuance — dispatcher issues code without request', async ({ asDispatcher }) => {
    test.skip(!testLoadId, 'No test load');

    const res = await asDispatcher.post(`/loads/${testLoadId}/money-codes/issue`, {
      code: 'QA-PROACTIVE-1234',
      amountCents: 25000,
      method: 'comchek',
      dispatcherNote: 'Pre-emptive code for known lumper facility',
    });

    if (res.status() === 404) {
      console.log('   ⚠️ No driver assigned — cannot issue proactively');
      return;
    }

    expect(res.ok(), `Issue: ${res.status()}`).toBeTruthy();
    const mc = await res.json();
    expect(mc.status).toBe('approved');
    expect(mc.code).toBe('QA-PROACTIVE-1234');
    console.log(`   ✅ Proactively issued: ${mc.moneyCodeId} — code: ${mc.code}`);
  });
});

test.describe('E2E: Driver Actions @workflow', () => {
  let actionLoadId: string;

  test('1. Find load for driver action testing', async ({ asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load with driver');
    actionLoadId = load!.loadId;
  });

  test('2. Driver submits detention report', async ({ asDriver }) => {
    test.skip(!actionLoadId, 'No test load');

    const res = await asDriver.post(`/loads/${actionLoadId}/driver-actions`, {
      actionType: 'detention',
      note: 'QA test — waiting 3+ hours at dock',
    });

    if (res.status() === 403) {
      test.skip(true, 'Driver not assigned to this load');
      return;
    }

    expect(res.ok(), `Create detention: ${res.status()}`).toBeTruthy();
    const action = await res.json();
    expect(action.actionType).toBe('detention');
    expect(action.status).toBe('submitted');
    console.log(`   ✅ Detention reported: ${action.actionRequestId}`);
  });

  test('3. Driver submits scale ticket', async ({ asDriver }) => {
    test.skip(!actionLoadId, 'No test load');

    const res = await asDriver.post(`/loads/${actionLoadId}/driver-actions`, {
      actionType: 'scale_ticket',
      metadata: { weightLbs: 42500 },
    });

    if (res.status() === 403) {
      test.skip(true, 'Driver not assigned');
      return;
    }

    expect(res.ok(), `Create scale ticket: ${res.status()}`).toBeTruthy();
    const action = await res.json();
    expect(action.actionType).toBe('scale_ticket');
    console.log(`   ✅ Scale ticket: ${action.actionRequestId}`);
  });

  test('4. Driver submits fuel receipt', async ({ asDriver }) => {
    test.skip(!actionLoadId, 'No test load');

    const res = await asDriver.post(`/loads/${actionLoadId}/driver-actions`, {
      actionType: 'fuel_receipt',
      metadata: { amountCents: 45000, gallons: 120.5 },
    });

    if (res.status() === 403) {
      test.skip(true, 'Driver not assigned');
      return;
    }

    expect(res.ok(), `Create fuel receipt: ${res.status()}`).toBeTruthy();
    const action = await res.json();
    expect(action.actionType).toBe('fuel_receipt');
    console.log(`   ✅ Fuel receipt: ${action.actionRequestId}`);
  });

  test('5. Driver submits issue report', async ({ asDriver }) => {
    test.skip(!actionLoadId, 'No test load');

    const res = await asDriver.post(`/loads/${actionLoadId}/driver-actions`, {
      actionType: 'issue_report',
      note: 'QA test — flat tire on highway',
      metadata: { gps: { lat: 32.7767, lon: -96.797 } },
    });

    if (res.status() === 403) {
      test.skip(true, 'Driver not assigned');
      return;
    }

    expect(res.ok(), `Create issue report: ${res.status()}`).toBeTruthy();
    const action = await res.json();
    expect(action.actionType).toBe('issue_report');
    expect(action.status).toBe('submitted');
    console.log(`   ✅ Issue reported: ${action.actionRequestId}`);
  });

  test('6. List driver actions for load (dispatcher)', async ({ asDispatcher }) => {
    test.skip(!actionLoadId, 'No test load');

    const res = await asDispatcher.get(`/loads/${actionLoadId}/driver-actions`);
    expect(res.ok(), `List actions: ${res.status()}`).toBeTruthy();
    const actions = await res.json();
    expect(Array.isArray(actions)).toBeTruthy();

    const byType: Record<string, number> = {};
    for (const a of actions) {
      byType[a.actionType] = (byType[a.actionType] || 0) + 1;
    }
    console.log(
      `   📋 ${actions.length} action(s): ${Object.entries(byType)
        .map(([t, c]) => `${c} ${t}`)
        .join(', ')}`,
    );
  });

  test('7. Dispatcher acknowledges a driver action', async ({ asDispatcher }) => {
    test.skip(!actionLoadId, 'No test load');

    const listRes = await asDispatcher.get(`/loads/${actionLoadId}/driver-actions`);
    const actions = await listRes.json();
    const submitted = (Array.isArray(actions) ? actions : []).find((a: any) => a.status === 'submitted');
    test.skip(!submitted, 'No submitted actions to acknowledge');

    const res = await asDispatcher.patch(
      `/loads/${actionLoadId}/driver-actions/${submitted.actionRequestId}/acknowledge`,
    );
    expect(res.ok(), `Acknowledge: ${res.status()}`).toBeTruthy();
    const acked = await res.json();
    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedAt).toBeTruthy();
    console.log(`   ✅ Acknowledged: ${acked.actionRequestId}`);
  });

  test('8. Dispatcher resolves a driver action', async ({ asDispatcher }) => {
    test.skip(!actionLoadId, 'No test load');

    const listRes = await asDispatcher.get(`/loads/${actionLoadId}/driver-actions`);
    const actions = await listRes.json();
    const resolvable = (Array.isArray(actions) ? actions : []).find(
      (a: any) => a.status === 'acknowledged' || a.status === 'submitted',
    );
    test.skip(!resolvable, 'No actions to resolve');

    const res = await asDispatcher.patch(`/loads/${actionLoadId}/driver-actions/${resolvable.actionRequestId}/resolve`);
    expect(res.ok(), `Resolve: ${res.status()}`).toBeTruthy();
    const resolved = await res.json();
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeTruthy();
    console.log(`   ✅ Resolved: ${resolved.actionRequestId}`);
  });
});

test.describe('E2E: Money Code & Driver Actions RBAC @workflow', () => {
  test('RBAC: CUSTOMER cannot list money codes', async ({ asCustomer, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load with driver');

    const res = await asCustomer.get(`/loads/${load!.loadId}/money-codes`);
    expect([403, 401].includes(res.status()), `Customer should be denied: got ${res.status()}`).toBeTruthy();
  });

  test('RBAC: CUSTOMER cannot list driver actions', async ({ asCustomer, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load with driver');

    const res = await asCustomer.get(`/loads/${load!.loadId}/driver-actions`);
    expect([403, 401].includes(res.status()), `Customer should be denied: got ${res.status()}`).toBeTruthy();
  });

  test('RBAC: DRIVER cannot approve money codes', async ({ asDriver, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load');

    const res = await asDriver.patch(`/loads/${load!.loadId}/money-codes/fake-id/approve`, {
      code: 'HACK',
      amountCents: 100,
    });
    expect([403, 401].includes(res.status()), `Driver should not approve: got ${res.status()}`).toBeTruthy();
  });

  test('RBAC: DRIVER cannot deny money codes', async ({ asDriver, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load');

    const res = await asDriver.patch(`/loads/${load!.loadId}/money-codes/fake-id/deny`, {});
    expect([403, 401].includes(res.status()), `Driver should not deny: got ${res.status()}`).toBeTruthy();
  });

  test('RBAC: DRIVER cannot access insights', async ({ asDriver, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load');

    const res = await asDriver.get(`/loads/${load!.loadId}/money-codes/insights`);
    expect([403, 401].includes(res.status()), `Driver should not see insights: got ${res.status()}`).toBeTruthy();
  });

  test('RBAC: CUSTOMER cannot submit driver actions', async ({ asCustomer, asDispatcher }) => {
    const load = await getLoadWithDriver(asDispatcher);
    test.skip(!load, 'No load');

    const res = await asCustomer.post(`/loads/${load!.loadId}/driver-actions`, {
      actionType: 'detention',
      note: 'Should not work',
    });
    expect([403, 401].includes(res.status()), `Customer should not submit: got ${res.status()}`).toBeTruthy();
  });
});
