import { documentExpiryConditionsEvaluator } from '../conditions-evaluator';
import type { DocumentExpiryHydrateOutput } from '../step.types';

/**
 * Unit coverage for the Document Expiry conditions evaluator — the hard
 * rules the shared gate applies (severity / credential / lead window /
 * excluded drivers).
 *
 * The gate is job-blind: it hands Document Expiry the hydrate output it
 * produced and the evaluator reads `entity.finding.*` directly. These
 * tests build a hydrate output carrying just the finding fields the
 * evaluator reads.
 */

interface FindingFacts {
  driverId?: string;
  credentialType?: string;
  severity?: string;
  daysUntilExpiry?: number | null;
}

/** Build a Document Expiry hydrate output with just the fields the evaluator reads. */
function hydrate(facts: FindingFacts = {}): DocumentExpiryHydrateOutput {
  const base = {
    driverId: 'DRV-1',
    credentialType: 'medical_card',
    severity: 'WARNING',
    daysUntilExpiry: 12 as number | null,
    ...facts,
  };
  return {
    entity: {
      finding: {
        driverId: base.driverId,
        credentialType: base.credentialType,
        severity: base.severity,
        daysUntilExpiry: base.daysUntilExpiry,
      },
    },
  } as unknown as DocumentExpiryHydrateOutput;
}

describe('documentExpiryConditionsEvaluator', () => {
  it('all conditions met → conditionsMet=true', () => {
    const result = documentExpiryConditionsEvaluator(
      { severities: ['CRITICAL', 'WARNING'], credentialTypes: ['cdl', 'medical_card'] },
      hydrate(),
    );
    expect(result.conditionsMet).toBe(true);
    expect(result.checks).toEqual({
      severityOk: true,
      credentialTypeOk: true,
      leadDaysOk: true,
      excludedDriverOk: true,
    });
  });

  it('gates when the finding severity is not in the allowed set', () => {
    const result = documentExpiryConditionsEvaluator({ severities: ['CRITICAL'] }, hydrate({ severity: 'WARNING' }));
    expect(result.conditionsMet).toBe(false);
    expect(result.checks.severityOk).toBe(false);
  });

  it('gates when the credential type is not in the allowed set', () => {
    const result = documentExpiryConditionsEvaluator(
      { credentialTypes: ['cdl'] },
      hydrate({ credentialType: 'medical_card' }),
    );
    expect(result.conditionsMet).toBe(false);
    expect(result.checks.credentialTypeOk).toBe(false);
  });

  it('gates when days-to-expiry exceeds leadDays', () => {
    const result = documentExpiryConditionsEvaluator({ leadDays: 7 }, hydrate({ daysUntilExpiry: 20 }));
    expect(result.conditionsMet).toBe(false);
    expect(result.checks.leadDaysOk).toBe(false);
  });

  it('passes leadDays for an already-expired credential regardless of the window', () => {
    const result = documentExpiryConditionsEvaluator({ leadDays: 7 }, hydrate({ daysUntilExpiry: -3 }));
    expect(result.checks.leadDaysOk).toBe(true);
  });

  it('passes leadDays when daysUntilExpiry is unknown (do not suppress on missing data)', () => {
    const result = documentExpiryConditionsEvaluator({ leadDays: 7 }, hydrate({ daysUntilExpiry: null }));
    expect(result.checks.leadDaysOk).toBe(true);
  });

  it('gates excluded drivers', () => {
    const result = documentExpiryConditionsEvaluator({ excludeDriverIds: ['DRV-1'] }, hydrate({ driverId: 'DRV-1' }));
    expect(result.conditionsMet).toBe(false);
    expect(result.checks.excludedDriverOk).toBe(false);
  });

  it('treats empty/absent condition arrays as "no restriction"', () => {
    const result = documentExpiryConditionsEvaluator({ severities: [], credentialTypes: [] }, hydrate());
    expect(result.conditionsMet).toBe(true);
  });
});
