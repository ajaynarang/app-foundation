import { DocumentExpiry } from '@app/shared-types';

import type { ConditionsEvaluator, ConditionsResult } from '../definition.types';
import type { DocumentExpiryHydrateOutput } from './step.types';

type DocumentExpiryConditions = DocumentExpiry.DocumentExpiryConditions;

/**
 * Document Expiry condition evaluator — pure function over the snapshotted
 * conditions + Document Expiry's own hydrate output.
 *
 * Single source of truth for the responsibility's hard rules. Supplied to
 * the gate via `DOCUMENT_EXPIRY_DEFINITION.conditionsEvaluator`; the shared
 * gate step is job-blind — it hands this responsibility the hydrate output
 * it produced (typed `unknown`) and the evaluator casts it to its own
 * shape and reads the credential-expiry facts its rules need:
 *   - finding.severity        → vs `severities`
 *   - finding.credentialType  → vs `credentialTypes`
 *   - finding.daysUntilExpiry → vs `leadDays` (expired always passes)
 *   - finding.driverId        → vs `excludeDriverIds`
 */
export const documentExpiryConditionsEvaluator: ConditionsEvaluator = (conditions, hydrate) =>
  evaluateDocumentExpiryConditions(
    DocumentExpiry.DocumentExpiryConditionsSchema.parse(conditions),
    hydrate as DocumentExpiryHydrateOutput,
  );

function evaluateDocumentExpiryConditions(
  conditions: DocumentExpiryConditions,
  hydrate: DocumentExpiryHydrateOutput,
): ConditionsResult {
  const finding = hydrate.entity.finding;

  const severityOk =
    !conditions.severities ||
    conditions.severities.length === 0 ||
    (finding.severity != null && (conditions.severities as readonly string[]).includes(finding.severity));

  const credentialTypeOk =
    !conditions.credentialTypes ||
    conditions.credentialTypes.length === 0 ||
    (finding.credentialType != null &&
      (conditions.credentialTypes as readonly string[]).includes(finding.credentialType));

  // leadDays widens/narrows the reminder window. Expired credentials
  // (daysUntilExpiry <= 0) always pass — biasing toward acting on the
  // OOS-critical case. Unknown daysUntilExpiry passes (don't suppress on
  // missing data).
  const days = finding.daysUntilExpiry ?? null;
  const leadDaysOk = conditions.leadDays === undefined || days === null || days <= 0 || days <= conditions.leadDays;

  const driverId = finding.driverId ?? null;
  const excludedDriverOk =
    !conditions.excludeDriverIds || driverId === null || !conditions.excludeDriverIds.includes(driverId);

  return {
    checks: { severityOk, credentialTypeOk, leadDaysOk, excludedDriverOk },
    conditionsMet: severityOk && credentialTypeOk && leadDaysOk && excludedDriverOk,
  };
}
