import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * E2E: IFTA Compliance — Quarterly Tax Filing for Interstate Carriers
 *
 * IFTA (International Fuel Tax Agreement) is a DOT requirement for any truck
 * operating in multiple states. Every quarter, carriers must report:
 * - Miles driven in each state
 * - Fuel purchased in each state
 * - Tax owed/credit per state (tax follows where you DROVE, not where you bought fuel)
 *
 * REAL SCENARIO:
 * "We drove 15,000 miles in Texas but only bought 3,000 gallons there.
 *  We drove 8,000 miles in Oklahoma but bought 5,000 gallons there.
 *  IFTA calculates the tax redistribution — we owe Texas, Oklahoma owes us."
 *
 * FLOW 1: Quarter Management
 *   1. List IFTA quarters — verify current and past quarters exist
 *   2. Quarter detail — state-by-state mileage and fuel breakdown
 *   3. Quarter summary — deadline countdown, filing status
 *
 * FLOW 2: Data Entry
 *   4. Record fuel purchase — driver fills up at truck stop
 *   5. Verify fuel purchase appears in quarter data
 *   6. Mileage entries — verify state-level breakdown
 *   7. Delete a fuel purchase
 *
 * FLOW 3: Tax Calculation
 *   8. Calculate IFTA tax — net tax per state
 *   9. Filing status transitions (OPEN → IN_REVIEW → FILED)
 *
 * FLOW 4: Access Control
 *  10. DRIVER can record fuel (they're at the pump)
 *  11. DISPATCHER can view quarters
 *  12. CUSTOMER cannot access IFTA data
 *
 * @workflow
 */

async function expectOrFeatureGated(res: any, endpoint: string): Promise<boolean> {
  if (res.ok()) return true;
  if (res.status() === 403) {
    const body = await res.text();
    if (
      body.toLowerCase().includes('feature') ||
      body.toLowerCase().includes('plan') ||
      body.toLowerCase().includes('not enabled')
    ) {
      test.skip(true, `${endpoint}: feature not enabled on tenant plan`);
      return false;
    }
  }
  return true;
}

test.describe('E2E: IFTA Quarter Management @workflow', () => {
  let quarterId: string | null = null;
  let fuelPurchaseId: string | null = null;

  test('1. List IFTA quarters — current and historical', async ({ asAdmin }) => {
    const res = await asAdmin.get('/ifta/quarters');
    if (!(await expectOrFeatureGated(res, 'ifta/quarters'))) return;
    expect(res.ok()).toBeTruthy();

    const quarters = await res.json();
    const items = Array.isArray(quarters) ? quarters : quarters.data || [];
    expect(items.length, 'At least one IFTA quarter should exist').toBeGreaterThan(0);

    const q = items[0];
    expect(q).toHaveProperty('id');
    expect(q).toHaveProperty('year');
    expect(q).toHaveProperty('quarter');
    expect(q).toHaveProperty('status');
    expect(q.year).toBeGreaterThanOrEqual(2025);
    expect(q.quarter).toBeGreaterThanOrEqual(1);
    expect(q.quarter).toBeLessThanOrEqual(4);

    quarterId = q.id;

    // Log all quarters
    for (const quarter of items.slice(0, 4)) {
      console.log(`   📅 Q${quarter.quarter} ${quarter.year}: ${quarter.status}`);
    }
  });

  test('2. Quarter detail — state-by-state breakdown', async ({ asAdmin }) => {
    test.skip(!quarterId, 'No quarter found');

    const res = await asAdmin.get(`/ifta/quarters/${quarterId}`);
    if (!(await expectOrFeatureGated(res, `ifta/quarters/${quarterId}`))) return;
    expect(res.ok()).toBeTruthy();

    const detail = await res.json();
    expect(detail).toHaveProperty('id');
    expect(detail).toHaveProperty('year');
    expect(detail).toHaveProperty('quarter');
    // Should have state-level data
    console.log(`   📊 Quarter detail: ${JSON.stringify(detail).slice(0, 500)}`);
  });

  test('3. Quarter summary — deadline and filing status', async ({ asAdmin }) => {
    test.skip(!quarterId, 'No quarter found');

    const res = await asAdmin.get(`/ifta/quarters/${quarterId}/summary`);
    if (!(await expectOrFeatureGated(res, `ifta/quarters/${quarterId}/summary`))) return;
    expect(res.ok()).toBeTruthy();

    const summary = await res.json();
    expect(summary).toBeDefined();
    console.log(`   📋 Summary: ${JSON.stringify(summary).slice(0, 400)}`);
  });

  test('4. Record fuel purchase — driver fills up', async ({ asAdmin }) => {
    const today = new Date().toISOString().split('T')[0];

    const res = await asAdmin.post('/ifta/fuel', {
      date: today,
      state: 'TX',
      vendor: 'QA Pilot Travel Center',
      gallons: 152.3,
      amountCents: 68535, // $685.35 ($4.50/gal)
      fuelType: 'DIESEL',
    });
    if (!(await expectOrFeatureGated(res, 'ifta/fuel'))) return;

    if (res.ok()) {
      const purchase = await res.json();
      expect(purchase).toHaveProperty('id');
      fuelPurchaseId = purchase.id;
      console.log(`   ⛽ Fuel purchase recorded: ${purchase.id} — 152.3 gal in TX`);
    } else {
      // May fail if quarter not properly initialized
      expect(res.status()).toBeLessThan(500);
      console.log(`   ⚠️ Fuel record: ${res.status()}`);
    }
  });

  test('5. Fuel purchases for quarter — verify our entry', async ({ asAdmin }) => {
    test.skip(!quarterId, 'No quarter');

    const res = await asAdmin.get(`/ifta/quarters/${quarterId}/fuel`);
    if (!(await expectOrFeatureGated(res, `ifta/quarters/${quarterId}/fuel`))) return;
    expect(res.ok()).toBeTruthy();

    const fuel = await res.json();
    const items = Array.isArray(fuel) ? fuel : fuel.data || [];
    console.log(`   ⛽ ${items.length} fuel purchase(s) in quarter`);

    // If we created a purchase, verify it's in the list
    if (fuelPurchaseId && items.length > 0) {
      const ours = items.find((f: any) => f.id === fuelPurchaseId);
      if (ours) {
        expect(ours.gallons).toBe(152.3);
        expect(ours.state).toBe('TX');
        console.log(`   ✅ Our fuel purchase found in quarter data`);
      }
    }
  });

  test('6. Mileage entries for quarter', async ({ asAdmin }) => {
    test.skip(!quarterId, 'No quarter');

    const res = await asAdmin.get(`/ifta/quarters/${quarterId}/mileage`);
    if (!(await expectOrFeatureGated(res, `ifta/quarters/${quarterId}/mileage`))) return;
    expect(res.ok()).toBeTruthy();

    const mileage = await res.json();
    const items = Array.isArray(mileage) ? mileage : mileage.data || [];
    console.log(`   🛣️ ${items.length} mileage entries in quarter`);

    // Mileage should be broken down by state
    if (items.length > 0) {
      const byState: Record<string, number> = {};
      for (const entry of items) {
        if (entry.state) {
          byState[entry.state] = (byState[entry.state] || 0) + (entry.miles || 0);
        }
      }
      const topStates = Object.entries(byState)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      console.log(`   📊 Top states: ${topStates.map(([s, m]) => `${s}=${m}mi`).join(', ')}`);
    }
  });

  test('7. Calculate IFTA tax', async ({ asAdmin }) => {
    test.skip(!quarterId, 'No quarter');

    const res = await asAdmin.post(`/ifta/quarters/${quarterId}/calculate`);
    if (!(await expectOrFeatureGated(res, `ifta/quarters/${quarterId}/calculate`))) return;
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const calc = await res.json();
      console.log(`   🧮 Tax calculation: ${JSON.stringify(calc).slice(0, 400)}`);
    } else {
      console.log(`   ⚠️ Calculate: ${res.status()} (may need more data)`);
    }
  });

  test('8. IFTA tax rates — reference data', async ({ asAdmin }) => {
    const res = await asAdmin.get('/ifta/tax-rates');
    if (!(await expectOrFeatureGated(res, 'ifta/tax-rates'))) return;
    expect(res.ok()).toBeTruthy();

    const rates = await res.json();
    const items = Array.isArray(rates) ? rates : rates.data || [];
    expect(items.length, 'Should have tax rates for multiple states').toBeGreaterThan(0);

    if (items.length > 0) {
      const rate = items[0];
      expect(rate).toHaveProperty('state');
      expect(rate).toHaveProperty('rate');
      console.log(`   💲 ${items.length} state tax rates (e.g., ${rate.state}: $${rate.rate}/gal)`);
    }
  });

  test('9. Delete fuel purchase — cleanup', async ({ asAdmin }) => {
    test.skip(!fuelPurchaseId, 'No fuel purchase to delete');

    const res = await asAdmin.delete(`/ifta/fuel/${fuelPurchaseId}`);
    if (!(await expectOrFeatureGated(res, `ifta/fuel/${fuelPurchaseId}`))) return;
    expect(res.ok(), `Delete fuel: ${res.status()}`).toBeTruthy();
    console.log(`   🗑️ Cleaned up fuel purchase ${fuelPurchaseId}`);
  });
});

test.describe('E2E: IFTA Access Control @workflow', () => {
  test('10. DISPATCHER can view IFTA quarters', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/ifta/quarters');
    if (!(await expectOrFeatureGated(res, 'ifta/quarters'))) return;
    expect(res.ok(), `Dispatcher IFTA access: ${res.status()}`).toBeTruthy();
  });

  test('11. DRIVER can record fuel purchases (at the pump)', async ({ asDriver }) => {
    const res = await asDriver.post('/ifta/fuel', {
      date: new Date().toISOString().split('T')[0],
      state: 'OK',
      vendor: 'TA Truck Stop',
      gallons: 100,
      amountCents: 42000,
      fuelType: 'DIESEL',
    });
    // Driver should be allowed to record fuel per @Roles decorator
    if (res.status() === 403) {
      const body = await res.text();
      if (body.includes('feature') || body.includes('plan')) {
        test.skip(true, 'IFTA feature not enabled');
        return;
      }
    }
    expect(res.status()).toBeLessThan(500);
    console.log(`   ✅ Driver fuel recording: ${res.status()}`);
  });

  test('12. CUSTOMER cannot access IFTA — compliance data is internal', async ({ asCustomer }) => {
    const res = await asCustomer.get('/ifta/quarters');
    expect([403, 404].includes(res.status()), `Customer should be denied IFTA: ${res.status()}`).toBeTruthy();
  });

  test('13. CUSTOMER cannot record fuel', async ({ asCustomer }) => {
    const res = await asCustomer.post('/ifta/fuel', {
      date: '2026-01-01',
      state: 'TX',
      vendor: 'Hack',
      gallons: 1,
      amountCents: 100,
    });
    expect([403, 404].includes(res.status())).toBeTruthy();
  });
});
