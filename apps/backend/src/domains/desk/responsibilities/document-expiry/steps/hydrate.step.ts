import { DeskEpisodeStepKind, MemoryPolarity, ShieldFindingCategory } from '@prisma/client';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';
import { DocumentExpiry } from '@app/shared-types';

import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { DeskMemoryService } from '../../../core/memory/desk-memory.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import type { HydrateMemoryItem, HydratePreflightResult } from '../../../shared-steps/step.types';
import type { DocumentExpiryHydrateInput, DocumentExpiryHydrateOutput } from '../step.types';

/**
 * hydrate step — the Document Expiry episode's context-loading atom.
 *
 * One step row with kind='hydrate'. Bundles:
 *   1. The current OPEN Shield credential-expiry finding for this
 *      (driver, credential) — re-queried fresh because Shield re-creates
 *      findings with new ids each audit; we ride the open finding, not a
 *      stale findingId.
 *   2. Driver contact (email, phone) resolved by driverId.
 *   3. Admin/owner contact fallback (ADMIN/OWNER user, then Tenant.contactEmail).
 *   4. Prior-reminder count for this (driver, credential) from AgentInvocationLog.
 *   5. Memory lookup (entity-scoped via DeskMemoryService).
 *   6. Preflight (skip→no_action if reminded recently or finding resolved).
 *   7. Generic `relationshipRef` ({ driverId, credentialType }) so the shared
 *      close step folds it into the memory entityRef without a doc-expiry
 *      branch. The gate is job-blind and reads `entity.finding.*` from output.
 *
 * Writes one step row regardless of preflight outcome.
 */
const RECENT_REMINDER_DAYS = 7;
const LOOKBACK_DAYS = 30;

export async function hydrateStep(input: DocumentExpiryHydrateInput): Promise<DocumentExpiryHydrateOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const memoryService = app.get(DeskMemoryService);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      id: true,
      tenantId: true,
      ownerAgentId: true,
      entityType: true,
      entityId: true,
      conditionsSnapshot: true,
    },
  });

  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.HYDRATE,
  });

  try {
    if (episode.entityType !== 'driver' || !episode.entityId) {
      throw new Error(`hydrate: Document Expiry requires entityType=driver; got ${episode.entityType}`);
    }
    const driverId = episode.entityId;

    // The credential under review is carried on the dedupe key /
    // conditionsSnapshot; we resolve it from the episode's stored
    // credentialType (persisted on the episode at trigger time via the
    // entity label / dedupe key). Recover it from the dedupe key shape
    // when present; otherwise infer from the open finding below.
    const snapshotCredential = readCredentialFromSnapshot(episode.conditionsSnapshot);

    // ── 1. Current open finding (fresh — ids churn across audits) ──────
    const regulations = snapshotCredential
      ? regulationsFor([snapshotCredential])
      : Object.keys(DocumentExpiry.DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL);

    const findingRow = await prisma.shieldFinding.findFirst({
      where: {
        tenantId: episode.tenantId,
        category: ShieldFindingCategory.DRIVERS,
        entityType: 'driver',
        entityId: driverId,
        isResolved: false,
        dueDate: { not: null },
        regulation: { in: regulations },
      },
      select: {
        id: true,
        entityName: true,
        severity: true,
        regulation: true,
        dueDate: true,
        recommendation: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // ── 2/3. Driver + admin contacts ──────────────────────────────────
    const [driverRow, adminContact] = await Promise.all([
      prisma.driver.findFirst({
        where: { tenantId: episode.tenantId, driverId },
        select: { name: true, email: true, phone: true },
      }),
      resolveAdminContact(prisma, episode.tenantId),
    ]);

    const driverContact = { email: driverRow?.email ?? null, phone: normalizeE164(driverRow?.phone ?? null) };

    // Finding resolved (or never existed) → nothing to remind about.
    if (!findingRow || !findingRow.regulation || !findingRow.dueDate) {
      const output = buildOutput({
        finding: null,
        driverId,
        driverName: driverRow?.name ?? driverId,
        driverContact,
        adminContact,
        priorReminderCount: 0,
        memories: [],
        preflight: {
          action: 'skip',
          outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
          reason: 'No open credential-expiry finding for this driver',
        },
      });
      await stepWriter.succeeded({ stepId: step.id, output: output as unknown as Record<string, unknown> });
      return output;
    }

    const credentialType = DocumentExpiry.DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL[findingRow.regulation];
    const credentialLabel = DocumentExpiry.DOCUMENT_EXPIRY_CREDENTIAL_LABELS[credentialType];
    const dueDateIso = findingRow.dueDate.toISOString().slice(0, 10);
    const daysUntilExpiry = daysBetween(new Date(), findingRow.dueDate);

    // ── 4. Prior reminders for this (driver, credential) ──────────────
    const priorReminderCount = await countRecentReminders(prisma, episode.tenantId, driverId, credentialType);

    // ── 5. Memory ─────────────────────────────────────────────────────
    const memories = await memoryService.findRelevant({
      tenantId: episode.tenantId,
      agentId: episode.ownerAgentId,
      entityRef: { driverId, credentialType },
      queryContext: `Driver ${findingRow.entityName ?? driverId} ${credentialLabel} expires ${dueDateIso} (${daysUntilExpiry} days); severity ${findingRow.severity}.`,
      queryIntent: MemoryPolarity.REINFORCE,
      limit: 5,
    });
    if (memories.length > 0) {
      await prisma.deskEpisode.update({
        where: { id: episode.id },
        data: { retrievedMemoryIds: memories.map((m) => m.id) },
      });
    }

    // ── 6. Preflight ──────────────────────────────────────────────────
    const preflight = evaluatePreflight({
      priorReminderCount,
      hasAnyContact: Boolean(driverContact.email || driverContact.phone || adminContact.email || adminContact.phone),
    });

    const output = buildOutput({
      finding: {
        findingId: findingRow.id,
        driverId,
        driverName: findingRow.entityName ?? driverRow?.name ?? driverId,
        severity: findingRow.severity as DocumentExpiry.DocumentExpirySeverity,
        credentialType,
        credentialLabel,
        dueDate: dueDateIso,
        daysUntilExpiry,
        recommendation: findingRow.recommendation,
      },
      driverId,
      driverName: findingRow.entityName ?? driverRow?.name ?? driverId,
      driverContact,
      adminContact,
      priorReminderCount,
      memories,
      preflight,
    });

    await stepWriter.succeeded({ stepId: step.id, output: output as unknown as Record<string, unknown> });
    return output;
  } catch (err) {
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers — pure / scoped to hydrate
// ─────────────────────────────────────────────────────────────────────────

function buildOutput(input: {
  finding: DocumentExpiryHydrateOutput['entity']['finding'] | null;
  driverId: string;
  driverName: string;
  driverContact: { email: string | null; phone: string | null };
  adminContact: { email: string | null; phone: string | null };
  priorReminderCount: number;
  memories: HydrateMemoryItem[];
  preflight: HydratePreflightResult;
}): DocumentExpiryHydrateOutput {
  const finding =
    input.finding ??
    ({
      findingId: '',
      driverId: input.driverId,
      driverName: input.driverName,
      severity: 'WARNING',
      credentialType: 'cdl',
      credentialLabel: DocumentExpiry.DOCUMENT_EXPIRY_CREDENTIAL_LABELS.cdl,
      dueDate: null,
      daysUntilExpiry: null,
      recommendation: null,
    } as DocumentExpiryHydrateOutput['entity']['finding']);

  return {
    entity: {
      finding,
      driverContact: input.driverContact,
      adminContact: input.adminContact,
      priorReminderCount: input.priorReminderCount,
    },
    // Counterparty keys the job-blind close step folds into the memory
    // entityRef (same `relationshipRef` seam AR + settlement use). The gate
    // reads `entity.finding.*` directly, so no pre-mapped gate entity here.
    relationshipRef: { driverId: input.driverId, credentialType: finding.credentialType },
    memories: input.memories,
    preflight: input.preflight,
  };
}

function evaluatePreflight(input: { priorReminderCount: number; hasAnyContact: boolean }): HydratePreflightResult {
  // skip_if_recent_action — already reminded for this (driver, credential)
  // within the recent window.
  if (input.priorReminderCount > 0) {
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
      reason: `Reminded within the last ${RECENT_REMINDER_DAYS} days`,
    };
  }
  // Can't remind anyone we can't reach.
  if (!input.hasAnyContact) {
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
      reason: 'No contact info on file for the driver or an admin',
    };
  }
  return { action: 'proceed' };
}

async function resolveAdminContact(
  prisma: PrismaService,
  tenantId: number,
): Promise<{ email: string | null; phone: string | null }> {
  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { email: true, phone: true },
    orderBy: { id: 'asc' },
  });
  if (admin?.email || admin?.phone) {
    return { email: admin.email ?? null, phone: normalizeE164(admin.phone ?? null) };
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { contactEmail: true } });
  return { email: tenant?.contactEmail ?? null, phone: null };
}

async function countRecentReminders(
  prisma: PrismaService,
  tenantId: number,
  driverId: string,
  credentialType: string,
): Promise<number> {
  const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentStart = new Date(Date.now() - RECENT_REMINDER_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.agentInvocationLog.findMany({
    where: {
      tenantId,
      toolName: { in: ['send-email', 'send-sms'] },
      success: true,
      createdAt: { gte: lookbackStart },
    },
    select: { createdAt: true, argsRedacted: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // A reminder counts when it references THIS driver + credential and was
  // sent within the recent window. We tag outbound reminders with the
  // driverId + credentialType in the message metadata at execute time.
  return rows.filter((row) => {
    if (row.createdAt < recentStart) return false;
    const a = (row.argsRedacted ?? {}) as Record<string, unknown>;
    const blob = JSON.stringify(a).toLowerCase();
    return blob.includes(driverId.toLowerCase()) && blob.includes(credentialType.toLowerCase());
  }).length;
}

function readCredentialFromSnapshot(snapshot: unknown): DocumentExpiry.DocumentExpiryCredentialType | null {
  if (snapshot && typeof snapshot === 'object' && '__credentialType' in snapshot) {
    const v = (snapshot as Record<string, unknown>).__credentialType;
    const parsed = DocumentExpiry.DocumentExpiryCredentialTypeSchema.safeParse(v);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

function regulationsFor(credentials: DocumentExpiry.DocumentExpiryCredentialType[]): string[] {
  const map = DocumentExpiry.DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL;
  return Object.keys(map).filter((reg) => credentials.includes(map[reg]));
}

function normalizeE164(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return /^\+[1-9]\d{1,14}$/.test(trimmed) ? trimmed : null;
}

function daysBetween(fromDate: Date, toDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay);
}
