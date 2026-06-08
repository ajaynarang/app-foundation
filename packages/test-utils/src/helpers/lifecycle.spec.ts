/**
 * lifecycle.spec.ts — Unit tests for load, driver, and financials lifecycle helpers.
 *
 * Uses mocked RoleApiClients — no real network calls. Each helper is tested for:
 *   - Happy path: correct method called, correct URL, returns parsed body.
 *   - Error path: non-OK status throws with context (method, URL, status, body).
 */

import { describe, it, expect, vi } from 'vitest';
import { createLoad, cleanupLoad, assignLoad, updateLoadStatus, revertLoad } from './load-lifecycle.js';
import { createDriver, activateDriver, deactivateDriver } from './driver-lifecycle.js';
import { generateInvoiceForLoad, recordPayment, cleanupInvoice } from './financials-lifecycle.js';

// ── Mock factory ──────────────────────────────────────────────────────────────

interface MockResponse {
  ok: boolean;
  status: number;
  body?: unknown;
  text?: string;
}

function mockApi(responses: MockResponse[]) {
  const queue = [...responses];

  const next = () => {
    const r = queue.shift();
    if (!r) throw new Error('mock api: no more responses queued');
    return {
      ok: () => r.ok,
      status: () => r.status,
      json: async () => r.body,
      text: async () => r.text ?? JSON.stringify(r.body ?? {}),
    };
  };

  return {
    token: 'test-token',
    role: 'DISPATCHER',
    get: vi.fn(() => Promise.resolve(next())),
    post: vi.fn(() => Promise.resolve(next())),
    put: vi.fn(() => Promise.resolve(next())),
    patch: vi.fn(() => Promise.resolve(next())),
    delete: vi.fn(() => Promise.resolve(next())),
  };
}

// ── createLoad ────────────────────────────────────────────────────────────────

describe('createLoad', () => {
  const CUSTOMER_ID = 42;

  it('returns the created load on success', async () => {
    const api = mockApi([{ ok: true, status: 201, body: { id: 1, loadId: 'ld-abc', status: 'PENDING' } }]);
    const load = await createLoad(api as any, CUSTOMER_ID);
    expect(load.id).toBe(1);
    expect(load.loadId).toBe('ld-abc');
    expect(api.post).toHaveBeenCalledWith('/loads', expect.any(Object));
    const [, payload] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((payload as Record<string, unknown>).customerId).toBe(CUSTOMER_ID);
  });

  it('applies overrides to the factory payload', async () => {
    const api = mockApi([{ ok: true, status: 201, body: { id: 2, loadId: 'ld-xyz', status: 'PENDING' } }]);
    await createLoad(api as any, CUSTOMER_ID, { commodityType: 'Hazmat' });
    const [, payload] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((payload as Record<string, unknown>).commodityType).toBe('Hazmat');
  });

  it('throws with URL + status + body on failure', async () => {
    const api = mockApi([{ ok: false, status: 422, text: 'Validation failed' }]);
    await expect(createLoad(api as any, CUSTOMER_ID)).rejects.toThrow(/POST \/loads.*422.*Validation failed/);
  });
});

// ── cleanupLoad ───────────────────────────────────────────────────────────────

describe('cleanupLoad', () => {
  it('resolves without error on 200', async () => {
    const api = mockApi([{ ok: true, status: 200 }]);
    await expect(cleanupLoad(api as any, 'ld-abc')).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith('/loads/ld-abc');
  });

  it('resolves without error on 404 (already deleted)', async () => {
    const api = mockApi([{ ok: false, status: 404 }]);
    await expect(cleanupLoad(api as any, 'ld-abc')).resolves.toBeUndefined();
  });

  it('throws on non-404 error', async () => {
    const api = mockApi([{ ok: false, status: 500, text: 'Internal error' }]);
    await expect(cleanupLoad(api as any, 'ld-abc')).rejects.toThrow(/DELETE.*500.*Internal error/);
  });
});

// ── assignLoad ────────────────────────────────────────────────────────────────

describe('assignLoad', () => {
  it('posts to assign endpoint with string driverId', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await assignLoad(api as any, 'ld-abc', 'DRV-aaa');
    expect(api.post).toHaveBeenCalledWith('/loads/ld-abc/assign', {
      driverId: 'DRV-aaa',
    });
  });

  it('includes string vehicleId when provided', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await assignLoad(api as any, 'ld-abc', 'DRV-aaa', 'VEH-xyz');
    expect(api.post).toHaveBeenCalledWith('/loads/ld-abc/assign', {
      driverId: 'DRV-aaa',
      vehicleId: 'VEH-xyz',
    });
  });

  it('throws on failure', async () => {
    const api = mockApi([{ ok: false, status: 400, text: 'Driver not found' }]);
    await expect(assignLoad(api as any, 'ld-abc', 'DRV-aaa')).rejects.toThrow(/400.*Driver not found/);
  });
});

// ── updateLoadStatus ──────────────────────────────────────────────────────────

describe('updateLoadStatus', () => {
  it('patches to the correct URL with status payload', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await updateLoadStatus(api as any, 'ld-abc', 'IN_TRANSIT');
    expect(api.patch).toHaveBeenCalledWith('/loads/ld-abc/status', { status: 'IN_TRANSIT' });
  });

  it('throws with status name on failure', async () => {
    const api = mockApi([{ ok: false, status: 409, text: 'Invalid transition' }]);
    await expect(updateLoadStatus(api as any, 'ld-abc', 'DELIVERED')).rejects.toThrow(
      /DELIVERED.*409.*Invalid transition/,
    );
  });
});

// ── revertLoad ────────────────────────────────────────────────────────────────

describe('revertLoad', () => {
  const body = {
    targetStatus: 'ASSIGNED',
    category: 'dispatcher_correction',
    reason: 'Driver reported wrong pickup — reverting to reassign',
  };

  it('posts to revert endpoint with full body', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await revertLoad(api as any, 'ld-abc', body);
    expect(api.post).toHaveBeenCalledWith('/loads/ld-abc/revert', body);
  });

  it('throws with target status on failure', async () => {
    const api = mockApi([{ ok: false, status: 400, text: 'No reversal path' }]);
    await expect(revertLoad(api as any, 'ld-abc', body)).rejects.toThrow(/ASSIGNED.*400.*No reversal path/);
  });
});

// ── createDriver ──────────────────────────────────────────────────────────────

describe('createDriver', () => {
  it('returns created driver on 201', async () => {
    const api = mockApi([
      { ok: true, status: 201, body: { id: 5, driverId: 'drv-aaa', name: 'Test Driver', status: 'PENDING' } },
    ]);
    const driver = await createDriver(api as any);
    expect(driver.id).toBe(5);
    expect(driver.driverId).toBe('drv-aaa');
    expect(api.post).toHaveBeenCalledWith('/drivers', expect.any(Object));
  });

  it('throws with context on failure', async () => {
    const api = mockApi([{ ok: false, status: 400, text: 'Email already taken' }]);
    await expect(createDriver(api as any)).rejects.toThrow(/POST \/drivers.*400.*Email already taken/);
  });
});

// ── activateDriver ────────────────────────────────────────────────────────────

describe('activateDriver', () => {
  it('posts to activate endpoint', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await activateDriver(api as any, 'drv-aaa');
    expect(api.post).toHaveBeenCalledWith('/drivers/drv-aaa/activate', {});
  });

  it('throws on failure', async () => {
    const api = mockApi([{ ok: false, status: 422, text: 'CDL not verified' }]);
    await expect(activateDriver(api as any, 'drv-aaa')).rejects.toThrow(/422.*CDL not verified/);
  });
});

// ── deactivateDriver ──────────────────────────────────────────────────────────

describe('deactivateDriver', () => {
  it('posts to deactivate endpoint', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await deactivateDriver(api as any, 'drv-aaa');
    expect(api.post).toHaveBeenCalledWith('/drivers/drv-aaa/deactivate', {});
  });

  it('throws on failure', async () => {
    const api = mockApi([{ ok: false, status: 500, text: 'Server error' }]);
    await expect(deactivateDriver(api as any, 'drv-aaa')).rejects.toThrow(/500.*Server error/);
  });
});

// ── generateInvoiceForLoad ────────────────────────────────────────────────────

describe('generateInvoiceForLoad', () => {
  it('returns generated invoice on 201', async () => {
    const api = mockApi([
      {
        ok: true,
        status: 201,
        body: { id: 10, invoiceNumber: 'INV-001', status: 'DRAFT', totalCents: 250000 },
      },
    ]);
    const invoice = await generateInvoiceForLoad(api as any, 'ld-abc');
    expect(invoice.id).toBe(10);
    expect(invoice.invoiceNumber).toBe('INV-001');
    expect(api.post).toHaveBeenCalledWith('/invoices/generate/ld-abc', {});
  });

  it('throws on failure', async () => {
    const api = mockApi([{ ok: false, status: 422, text: 'Load not delivered' }]);
    await expect(generateInvoiceForLoad(api as any, 'ld-abc')).rejects.toThrow(
      /POST.*generate.*422.*Load not delivered/,
    );
  });
});

// ── recordPayment ─────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  it('posts payment with default CHECK method', async () => {
    const api = mockApi([
      {
        ok: true,
        status: 201,
        body: {
          id: 1,
          amountCents: 100000,
          paymentMethod: 'CHECK',
          referenceNumber: null,
          paidAt: '2026-01-01T00:00:00Z',
        },
      },
    ]);
    const payment = await recordPayment(api as any, 'inv-001', 100000);
    expect(payment.amountCents).toBe(100000);
    const [, payload] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((payload as Record<string, unknown>).paymentMethod).toBe('CHECK');
  });

  it('accepts custom payment options', async () => {
    const api = mockApi([
      {
        ok: true,
        status: 201,
        body: {
          id: 2,
          amountCents: 50000,
          paymentMethod: 'ACH',
          referenceNumber: 'REF-123',
          paidAt: '2026-01-02T00:00:00Z',
        },
      },
    ]);
    await recordPayment(api as any, 'inv-001', 50000, {
      paymentMethod: 'ACH',
      referenceNumber: 'REF-123',
    });
    const [url] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/invoices/inv-001/payments');
  });

  it('throws on failure', async () => {
    const api = mockApi([{ ok: false, status: 400, text: 'Amount exceeds balance' }]);
    await expect(recordPayment(api as any, 'inv-001', 999999)).rejects.toThrow(/400.*Amount exceeds balance/);
  });
});

// ── cleanupInvoice ────────────────────────────────────────────────────────────

describe('cleanupInvoice', () => {
  it('resolves without error on success', async () => {
    const api = mockApi([{ ok: true, status: 200, body: {} }]);
    await expect(cleanupInvoice(api as any, 'inv-001')).resolves.toBeUndefined();
    expect(api.post).toHaveBeenCalledWith('/invoices/inv-001/void', {});
  });

  it('resolves without error on 404 (already voided)', async () => {
    const api = mockApi([{ ok: false, status: 404 }]);
    await expect(cleanupInvoice(api as any, 'inv-001')).resolves.toBeUndefined();
  });

  it('throws on unexpected error', async () => {
    const api = mockApi([{ ok: false, status: 500, text: 'Server error' }]);
    await expect(cleanupInvoice(api as any, 'inv-001')).rejects.toThrow(/500.*Server error/);
  });
});
