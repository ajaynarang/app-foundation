import { ShieldAuditStatus, ShieldFindingCategory } from '@prisma/client';
import { DocumentExpiry } from '@sally/shared-types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * Document Expiry fan-out adapter.
 *
 * Rides Shield's daily audit output — Shield is the SENSOR that detects
 * driver-credential expiry and writes `ShieldFinding` rows; this fan-out is
 * the ACTUATOR's entry point. It does NOT re-derive expiry from
 * `Driver.*Expiry` (that would duplicate ShieldRuleEngineService.checkDrivers()).
 *
 * The credential-expiry discriminator (verified against
 * shield-rule-engine.service.ts checkDrivers/checkExpiryDate):
 *   - category   = DRIVERS
 *   - entityType = 'driver'
 *   - isResolved = false
 *   - dueDate    != null         ← only expiry findings carry a dueDate;
 *                                   "No medical card on file", "CDL class
 *                                   not recorded", MVR/drug-test/annual-review
 *                                   staleness all have dueDate = null.
 *   - regulation IN the credential set (49 CFR 391.11 = CDL,
 *     49 CFR 391.41 = medical card) — restricts to the v1 credential pair.
 *
 * Preflight rules (recent-reminder suppression, finding-resolved) run inside
 * hydrate.step per episode; this keeps fan-out cheap.
 */

export interface DriverExpiryFinding {
  findingId: string;
  driverId: string;
  driverName: string;
  severity: DocumentExpiry.DocumentExpirySeverity;
  credentialType: DocumentExpiry.DocumentExpiryCredentialType;
  credentialLabel: string;
  dueDate: string | null; // ISO date YYYY-MM-DD
  recommendation: string | null;
}

export interface FanOutOptions {
  limit?: number;
  /** Skip the run when the latest completed audit is older than this. */
  staleAuditHours?: number;
}

export type FanOutResult =
  | { status: 'ok'; findings: DriverExpiryFinding[] }
  | { status: 'stale_audit'; lastCompletedAt: Date | null };

const CREDENTIAL_REGULATIONS = Object.keys(DocumentExpiry.DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL);
const DEFAULT_STALE_AUDIT_HOURS = 36;

/**
 * Find the open driver-credential-expiry findings for a tenant, guarding
 * against acting on a stale Shield audit.
 *
 * Returns `{ status: 'stale_audit' }` when the latest *completed* audit is
 * older than `staleAuditHours` (or none exists) — the caller skips the run,
 * logs, and triggers a fresh audit rather than reminding off stale data.
 */
export async function findDriverExpiryFindingsForTenant(
  prisma: PrismaService,
  tenantId: number,
  opts: FanOutOptions = {},
): Promise<FanOutResult> {
  const staleAfterHours = opts.staleAuditHours ?? DEFAULT_STALE_AUDIT_HOURS;

  const latestAudit = await prisma.shieldAudit.findFirst({
    where: { tenantId, status: ShieldAuditStatus.COMPLETED, completedAt: { not: null } },
    select: { completedAt: true },
    orderBy: { completedAt: 'desc' },
  });

  const cutoff = new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);
  if (!latestAudit?.completedAt || latestAudit.completedAt < cutoff) {
    return { status: 'stale_audit', lastCompletedAt: latestAudit?.completedAt ?? null };
  }

  const rows = await prisma.shieldFinding.findMany({
    where: {
      tenantId,
      category: ShieldFindingCategory.DRIVERS,
      isResolved: false,
      entityType: 'driver',
      entityId: { not: null },
      dueDate: { not: null },
      regulation: { in: CREDENTIAL_REGULATIONS },
    },
    select: {
      id: true,
      entityId: true,
      entityName: true,
      severity: true,
      regulation: true,
      dueDate: true,
      recommendation: true,
    },
    orderBy: { dueDate: 'asc' },
    take: opts.limit ?? 100,
  });

  const findings: DriverExpiryFinding[] = [];
  for (const r of rows) {
    // Only act on severities we route (CRITICAL / WARNING). INFO findings
    // never produce a reminder.
    if (r.severity !== 'CRITICAL' && r.severity !== 'WARNING') continue;
    if (!r.entityId || !r.regulation) continue;

    const credentialType = DocumentExpiry.DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL[r.regulation];
    if (!credentialType) continue; // defensive — `in` filter already restricts this

    findings.push({
      findingId: r.id,
      driverId: r.entityId,
      driverName: r.entityName ?? r.entityId,
      severity: r.severity,
      credentialType,
      credentialLabel: DocumentExpiry.DOCUMENT_EXPIRY_CREDENTIAL_LABELS[credentialType],
      dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
      recommendation: r.recommendation,
    });
  }

  return { status: 'ok', findings };
}
