export interface ShieldAuditJobPayload {
  tenantId: number;
  scope: 'FULL' | 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';
  triggeredBy: 'SCHEDULED' | 'MANUAL';
  triggeredById?: number;
  includeAi?: boolean;
  includeCustomRules?: boolean;
  auditPeriodDays?: number;
  /** Conversation ID to post results back to (async follow-up for Sally AI) */
  conversationId?: string;
  /** Request ID from the originating HTTP request for cross-cutting traceability */
  correlationId?: string;
}

export interface ShieldCoverageItem {
  check: string;
  regulation: string;
  source: 'rule' | 'ai';
}

export interface ShieldCategoryResult {
  category: 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';
  score: number;
  findings: ShieldFindingInput[];
  coverage?: ShieldCoverageItem[];
}

export interface ShieldFindingInput {
  category: 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'PASSED';
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  impact?: string;
  recommendation?: string;
  dueDate?: Date;
  source?: 'RULE' | 'AI' | 'CUSTOM';
  regulation?: string;
  metadata?: Record<string, unknown>;
}

export const SHIELD_SCORE_WEIGHTS = {
  HOS: 0.3,
  DRIVERS: 0.3,
  VEHICLES: 0.25,
  LOADS: 0.15,
} as const;

/**
 * How long an audit may sit in QUEUED/RUNNING before it's considered orphaned
 * (worker never picked it up, or died mid-run). A real audit finishes in
 * seconds, so 10 minutes is a generous safety margin. Past this, the audit is
 * treated as not-in-progress and auto-healed to CANCELLED on the next trigger.
 */
export const STALE_AUDIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * System Activity (`Job`) descriptor for shield audits. Used on both the write
 * side (createJob in triggerAudit / the cron) and the read side (finding the
 * Job to cancel). Shared so the two never drift — a typo would silently break
 * job linkage with no compile error.
 */
export const SHIELD_AUDIT_JOB = { category: 'safety', type: 'audit' } as const;

export function computeStatusLabel(score: number): 'PROTECTED' | 'AT_RISK' | 'VULNERABLE' {
  if (score >= 90) return 'PROTECTED';
  if (score >= 70) return 'AT_RISK';
  return 'VULNERABLE';
}

export function computeCategoryScore(findings: ShieldFindingInput[]): number {
  let deductions = 0;
  for (const f of findings) {
    if (f.severity === 'CRITICAL') deductions += 15;
    else if (f.severity === 'WARNING') deductions += 5;
  }
  return Math.max(0, Math.min(100, 100 - deductions));
}

export function computeOverallScore(
  categoryScores: Partial<Record<'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS', number>>,
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, weight] of Object.entries(SHIELD_SCORE_WEIGHTS)) {
    const score = categoryScores[cat as keyof typeof categoryScores];
    if (score != null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return 100;
  return Math.round(weightedSum / totalWeight);
}
