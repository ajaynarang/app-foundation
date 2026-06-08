import { LoadBillingStatus } from '@prisma/client';
import { LoadLegService } from './load-leg.service';

describe('LoadLegService — Pure Functions', () => {
  // ─── deriveLoadStatus ─────────────────────────────────────────────────────

  describe('deriveLoadStatus', () => {
    // Uniform states
    it('all pending → pending', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'PENDING' }, { status: 'PENDING' }])).toBe('PENDING');
    });

    it('all delivered → delivered', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'DELIVERED' }])).toBe('DELIVERED');
    });

    it('all cancelled → cancelled', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'CANCELLED' }, { status: 'CANCELLED' }])).toBe('CANCELLED');
    });

    // Priority: on_hold > in_transit > assigned > pending
    it('any on_hold → on_hold', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'PENDING' }, { status: 'ON_HOLD' }])).toBe('ON_HOLD');
    });

    it('any in_transit → in_transit', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'PENDING' }, { status: 'IN_TRANSIT' }])).toBe('IN_TRANSIT');
    });

    it('any assigned, none in_transit → assigned', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'PENDING' }, { status: 'ASSIGNED' }])).toBe('ASSIGNED');
    });

    // on_hold takes precedence over in_transit (checked first in implementation)
    it('on_hold takes precedence over in_transit', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'ON_HOLD' }, { status: 'IN_TRANSIT' }])).toBe('ON_HOLD');
    });

    it('on_hold takes precedence over assigned', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'ON_HOLD' }, { status: 'ASSIGNED' }])).toBe('ON_HOLD');
    });

    // Mixed with delivered
    it('mixed: delivered + assigned → assigned', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'ASSIGNED' }])).toBe('ASSIGNED');
    });

    it('mixed: delivered + in_transit → in_transit', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'IN_TRANSIT' }])).toBe('IN_TRANSIT');
    });

    // Mixed with cancelled (cancelled legs are filtered out)
    it('mixed: cancelled + delivered → delivered (filter cancelled)', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'CANCELLED' }, { status: 'DELIVERED' }])).toBe('DELIVERED');
    });

    it('mixed: cancelled + assigned → assigned (filter cancelled)', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'CANCELLED' }, { status: 'ASSIGNED' }])).toBe('ASSIGNED');
    });

    it('mixed: cancelled + pending → pending (filter cancelled)', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'CANCELLED' }, { status: 'PENDING' }])).toBe('PENDING');
    });

    // Single leg
    it('single leg pending → pending', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'PENDING' }])).toBe('PENDING');
    });

    it('single leg delivered → delivered', () => {
      expect(LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }])).toBe('DELIVERED');
    });

    // 3-leg scenarios
    it('3 legs: delivered + in_transit + pending → in_transit', () => {
      expect(
        LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'IN_TRANSIT' }, { status: 'PENDING' }]),
      ).toBe('IN_TRANSIT');
    });

    it('3 legs: delivered + assigned + pending → assigned', () => {
      expect(
        LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'ASSIGNED' }, { status: 'PENDING' }]),
      ).toBe('ASSIGNED');
    });

    it('3 legs: delivered + delivered + assigned → assigned', () => {
      expect(
        LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'DELIVERED' }, { status: 'ASSIGNED' }]),
      ).toBe('ASSIGNED');
    });

    it('3 legs: all delivered → delivered', () => {
      expect(
        LoadLegService.deriveLoadStatus([{ status: 'DELIVERED' }, { status: 'DELIVERED' }, { status: 'DELIVERED' }]),
      ).toBe('DELIVERED');
    });

    // Edge case
    it('empty array → pending (fallback)', () => {
      expect(LoadLegService.deriveLoadStatus([])).toBe('PENDING');
    });
  });

  // ─── getActiveLeg ─────────────────────────────────────────────────────────

  describe('getActiveLeg', () => {
    it('returns first non-terminal leg', () => {
      const legs = [
        { status: 'DELIVERED', sequence: 1 },
        { status: 'ASSIGNED', sequence: 2 },
        { status: 'PENDING', sequence: 3 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toEqual({
        status: 'ASSIGNED',
        sequence: 2,
      });
    });

    it('returns null when all delivered', () => {
      const legs = [
        { status: 'DELIVERED', sequence: 1 },
        { status: 'DELIVERED', sequence: 2 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toBeNull();
    });

    it('returns null when all cancelled', () => {
      const legs = [
        { status: 'CANCELLED', sequence: 1 },
        { status: 'CANCELLED', sequence: 2 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toBeNull();
    });

    it('returns first leg when all pending', () => {
      const legs = [
        { status: 'PENDING', sequence: 1 },
        { status: 'PENDING', sequence: 2 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toEqual({
        status: 'PENDING',
        sequence: 1,
      });
    });

    it('skips cancelled legs', () => {
      const legs = [
        { status: 'CANCELLED', sequence: 1 },
        { status: 'ASSIGNED', sequence: 2 },
        { status: 'PENDING', sequence: 3 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toEqual({
        status: 'ASSIGNED',
        sequence: 2,
      });
    });

    it('returns in_transit leg', () => {
      const legs = [
        { status: 'DELIVERED', sequence: 1 },
        { status: 'IN_TRANSIT', sequence: 2 },
        { status: 'PENDING', sequence: 3 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toEqual({
        status: 'IN_TRANSIT',
        sequence: 2,
      });
    });

    it('sorts by sequence before finding active leg', () => {
      const legs = [
        { status: 'PENDING', sequence: 3 },
        { status: 'ASSIGNED', sequence: 2 },
        { status: 'DELIVERED', sequence: 1 },
      ];
      // After sorting: seq 1 (delivered), seq 2 (assigned), seq 3 (pending)
      expect(LoadLegService.getActiveLeg(legs)).toEqual({
        status: 'ASSIGNED',
        sequence: 2,
      });
    });

    it('returns null for empty array', () => {
      expect(LoadLegService.getActiveLeg([])).toBeNull();
    });
  });

  // ─── validateLegTransition ────────────────────────────────────────────────

  describe('validateLegTransition', () => {
    // Valid transitions from pending
    it('pending → assigned: valid', () => {
      expect(LoadLegService.validateLegTransition('PENDING', 'ASSIGNED')).toBe(true);
    });

    it('pending → cancelled: valid', () => {
      expect(LoadLegService.validateLegTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    // Valid transitions from assigned
    it('assigned → in_transit: valid', () => {
      expect(LoadLegService.validateLegTransition('ASSIGNED', 'IN_TRANSIT')).toBe(true);
    });

    it('assigned → pending: valid', () => {
      expect(LoadLegService.validateLegTransition('ASSIGNED', 'PENDING')).toBe(true);
    });

    it('assigned → on_hold: valid', () => {
      expect(LoadLegService.validateLegTransition('ASSIGNED', 'ON_HOLD')).toBe(true);
    });

    it('assigned → cancelled: valid', () => {
      expect(LoadLegService.validateLegTransition('ASSIGNED', 'CANCELLED')).toBe(true);
    });

    // Valid transitions from in_transit
    it('in_transit → delivered: valid', () => {
      expect(LoadLegService.validateLegTransition('IN_TRANSIT', 'DELIVERED')).toBe(true);
    });

    it('in_transit → assigned: valid (revert)', () => {
      expect(LoadLegService.validateLegTransition('IN_TRANSIT', 'ASSIGNED')).toBe(true);
    });

    it('in_transit → on_hold: valid', () => {
      expect(LoadLegService.validateLegTransition('IN_TRANSIT', 'ON_HOLD')).toBe(true);
    });

    it('in_transit → cancelled: valid', () => {
      expect(LoadLegService.validateLegTransition('IN_TRANSIT', 'CANCELLED')).toBe(true);
    });

    // Valid transitions from on_hold
    it('on_hold → assigned: valid', () => {
      expect(LoadLegService.validateLegTransition('ON_HOLD', 'ASSIGNED')).toBe(true);
    });

    it('on_hold → pending: valid', () => {
      expect(LoadLegService.validateLegTransition('ON_HOLD', 'PENDING')).toBe(true);
    });

    it('on_hold → cancelled: valid', () => {
      expect(LoadLegService.validateLegTransition('ON_HOLD', 'CANCELLED')).toBe(true);
    });

    // Invalid transitions — terminal states
    it('delivered → anything: invalid', () => {
      expect(LoadLegService.validateLegTransition('DELIVERED', 'PENDING')).toBe(false);
      expect(LoadLegService.validateLegTransition('DELIVERED', 'ASSIGNED')).toBe(false);
      expect(LoadLegService.validateLegTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
      expect(LoadLegService.validateLegTransition('DELIVERED', 'CANCELLED')).toBe(false);
    });

    it('cancelled → anything: invalid', () => {
      expect(LoadLegService.validateLegTransition('CANCELLED', 'PENDING')).toBe(false);
      expect(LoadLegService.validateLegTransition('CANCELLED', 'ASSIGNED')).toBe(false);
      expect(LoadLegService.validateLegTransition('CANCELLED', 'IN_TRANSIT')).toBe(false);
      expect(LoadLegService.validateLegTransition('CANCELLED', 'DELIVERED')).toBe(false);
    });

    // Invalid transitions — skipping steps
    it('pending → in_transit: invalid (must assign first)', () => {
      expect(LoadLegService.validateLegTransition('PENDING', 'IN_TRANSIT')).toBe(false);
    });

    it("pending → delivered: invalid (can't skip)", () => {
      expect(LoadLegService.validateLegTransition('PENDING', 'DELIVERED')).toBe(false);
    });

    it("pending → on_hold: invalid (can't hold before assignment)", () => {
      expect(LoadLegService.validateLegTransition('PENDING', 'ON_HOLD')).toBe(false);
    });

    // Unknown status
    it('unknown status → false', () => {
      expect(LoadLegService.validateLegTransition('unknown', 'PENDING')).toBe(false);
    });

    // SQ-103 — defensive case coercion. The state machine is the canonical
    // source of allowed transitions; if upstream (a stale frontend or a
    // legacy row that wasn't normalized in migration `20260428192707`)
    // sends mixed-case values, accept them as long as they map to a valid
    // enum member. Truly unknown values still return false.
    describe('case-insensitive coercion (SQ-103 tripwire)', () => {
      it('accepts lowercase current status', () => {
        expect(LoadLegService.validateLegTransition('assigned', 'IN_TRANSIT')).toBe(true);
      });

      it('accepts lowercase target status', () => {
        expect(LoadLegService.validateLegTransition('ASSIGNED', 'in_transit')).toBe(true);
      });

      it('accepts mixed-case on both sides', () => {
        expect(LoadLegService.validateLegTransition('Assigned', 'In_Transit')).toBe(true);
      });

      it('still rejects values that are not valid enum members', () => {
        expect(LoadLegService.validateLegTransition('not_a_status', 'IN_TRANSIT')).toBe(false);
        expect(LoadLegService.validateLegTransition('ASSIGNED', 'not_a_status')).toBe(false);
      });

      it('still rejects an illegal-but-uppercase transition', () => {
        expect(LoadLegService.validateLegTransition('delivered', 'pending')).toBe(false);
      });
    });
  });

  // ─── classifyExchangeRemoval ──────────────────────────────────────────────
  //
  // The classifier decides whether removing a stop's "exchange" role means
  // deleting the stop entirely (Pattern A — added solely as a handoff) or
  // reverting actionType back to 'delivery' (Pattern B — promoted customer
  // stop). The table below covers every branch.

  describe('classifyExchangeRemoval', () => {
    const base = {
      stopLocationType: 'OTHER' as const,
      actualPieces: null,
      siblingUsageCount: 0,
    };

    it('clear-A: TRUCK_STOP with no freight or siblings → delete', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'TRUCK_STOP' });
      expect(result.resolution).toBe('delete');
      expect(result.reasonCode).toBe('pattern_a_clear');
    });

    it('clear-A: REST_AREA → delete', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'REST_AREA' });
      expect(result.resolution).toBe('delete');
    });

    it('clear-A: FUEL_STATION → delete', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'FUEL_STATION' });
      expect(result.resolution).toBe('delete');
    });

    it('clear-B (locationType): WAREHOUSE → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'WAREHOUSE' });
      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_location_type');
    });

    it('clear-B (locationType): DISTRIBUTION_CENTER → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({
        ...base,
        stopLocationType: 'DISTRIBUTION_CENTER',
      });
      expect(result.resolution).toBe('revert');
    });

    it('clear-B (locationType): PORT → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'PORT' });
      expect(result.resolution).toBe('revert');
    });

    it('clear-B (locationType): RAIL_YARD → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, stopLocationType: 'RAIL_YARD' });
      expect(result.resolution).toBe('revert');
    });

    it('clear-B (freight): OTHER-type with actualPieces > 0 → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, actualPieces: 12 });
      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_freight');
    });

    it('clear-B (sibling use): OTHER-type, used elsewhere as pickup/delivery → revert', () => {
      const result = LoadLegService.classifyExchangeRemoval({ ...base, siblingUsageCount: 3 });
      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_sibling_use');
    });

    it('freight signal beats Pattern-A locationType (Pilot that actually moved freight → revert)', () => {
      // Edge case: a TRUCK_STOP that somehow has freight quantity — trust the
      // freight signal over the locationType hint.
      const result = LoadLegService.classifyExchangeRemoval({
        ...base,
        stopLocationType: 'TRUCK_STOP',
        actualPieces: 1,
      });
      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_freight');
    });

    it('sibling use beats Pattern-A locationType', () => {
      const result = LoadLegService.classifyExchangeRemoval({
        ...base,
        stopLocationType: 'TRUCK_STOP',
        siblingUsageCount: 5,
      });
      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_sibling_use');
    });

    it('ambiguous: OTHER-type, no freight, no siblings → null', () => {
      const result = LoadLegService.classifyExchangeRemoval(base);
      expect(result.resolution).toBeNull();
      expect(result.reasonCode).toBe('ambiguous');
    });

    it('ambiguous: WAREHOUSE with explicit null pieces still classifies as revert (locationType decides)', () => {
      // Sanity — null pieces shouldn't push WAREHOUSE into ambiguous land.
      const result = LoadLegService.classifyExchangeRemoval({
        ...base,
        stopLocationType: 'WAREHOUSE',
        actualPieces: null,
      });
      expect(result.resolution).toBe('revert');
    });

    it('actualPieces zero is treated the same as null (no freight signal)', () => {
      const result = LoadLegService.classifyExchangeRemoval({
        ...base,
        stopLocationType: 'TRUCK_STOP',
        actualPieces: 0,
      });
      expect(result.resolution).toBe('delete');
      expect(result.reasonCode).toBe('pattern_a_clear');
    });
  });

  // ─── applyDeliverySideEffects ───────────────────────────────────────────────
  // SQ-114: relay delivery must reach billing parity with single-driver delivery.
  // This static helper is the single source of truth for the delivery side-effects
  // (billingStatus, stop completion, linehaul charge) shared by both the relay path
  // (LoadLegService.advanceLegStatus, inside its $transaction) and the non-relay path
  // (LoadStatusService.updateStatus). It must be idempotent and tx-agnostic.

  describe('applyDeliverySideEffects', () => {
    type MockTx = {
      loadStop: { updateMany: jest.Mock };
      loadCharge: { findFirst: jest.Mock; create: jest.Mock };
      load: { update: jest.Mock };
    };

    const makeTx = (existingLinehaul: { id: number } | null): MockTx => ({
      loadStop: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      loadCharge: {
        findFirst: jest.fn().mockResolvedValue(existingLinehaul),
        create: jest.fn().mockResolvedValue({ id: 99 }),
      },
      load: { update: jest.fn().mockResolvedValue({}) },
    });

    const baseLoad = {
      id: 42,
      loadNumber: 'LD-4323309-1',
      billingStatus: null as LoadBillingStatus | null,
      rateCents: 100000 as number | null,
    };

    it('sets billingStatus = PENDING_DOCUMENTS when currently null', async () => {
      const tx = makeTx(null);
      await LoadLegService.applyDeliverySideEffects(tx as any, baseLoad);
      expect(tx.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: expect.objectContaining({ billingStatus: 'PENDING_DOCUMENTS' }),
        }),
      );
    });

    it('marks all not-yet-completed stops COMPLETED with completedAt', async () => {
      const tx = makeTx(null);
      await LoadLegService.applyDeliverySideEffects(tx as any, baseLoad);
      expect(tx.loadStop.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loadId: 42, status: { not: 'COMPLETED' } },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      const callArg = tx.loadStop.updateMany.mock.calls[0][0];
      expect(callArg.data.completedAt).toBeInstanceOf(Date);
    });

    it('creates exactly one linehaul charge when none exists and rateCents is set', async () => {
      const tx = makeTx(null);
      await LoadLegService.applyDeliverySideEffects(tx as any, baseLoad);
      expect(tx.loadCharge.create).toHaveBeenCalledTimes(1);
      expect(tx.loadCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loadId: 42,
            chargeType: 'linehaul',
            unitPriceCents: 100000,
            totalCents: 100000,
          }),
        }),
      );
    });

    it('is idempotent — does NOT create a second linehaul charge if one exists', async () => {
      const tx = makeTx({ id: 7 });
      await LoadLegService.applyDeliverySideEffects(tx as any, baseLoad);
      expect(tx.loadCharge.create).not.toHaveBeenCalled();
    });

    it('does NOT clobber an already-advanced billingStatus (APPROVED)', async () => {
      const tx = makeTx({ id: 7 });
      await LoadLegService.applyDeliverySideEffects(tx as any, {
        ...baseLoad,
        billingStatus: LoadBillingStatus.APPROVED,
      });
      // load.update may run for stop side-effects elsewhere, but billingStatus must NOT be in the data
      const updateCalls = tx.load.update.mock.calls;
      for (const [arg] of updateCalls) {
        if (arg?.data && 'billingStatus' in arg.data) {
          expect(arg.data.billingStatus).not.toBe('PENDING_DOCUMENTS');
        }
      }
    });

    it('does NOT create a charge when rateCents is null', async () => {
      const tx = makeTx(null);
      await LoadLegService.applyDeliverySideEffects(tx as any, { ...baseLoad, rateCents: null });
      expect(tx.loadCharge.create).not.toHaveBeenCalled();
    });
  });
});
