import type { OutboundAllowKind } from '@appshore/db';
import type { OutboundAllowEntry, OutboundChannel, OutboundSuppression } from '@app/shared-types';

export const ALLOW_ENTRY_SELECT = {
  id: true,
  kind: true,
  value: true,
  note: true,
  createdAt: true,
  createdBy: { select: { userId: true, email: true, firstName: true, lastName: true } },
} as const;

export const SUPPRESSION_SELECT = {
  id: true,
  channel: true,
  recipient: true,
  subject: true,
  source: true,
  createdAt: true,
  tenant: { select: { tenantId: true, companyName: true } },
} as const;

interface AllowEntryRow {
  id: string;
  kind: OutboundAllowKind;
  value: string;
  note: string | null;
  createdAt: Date;
  createdBy: { userId: string; email: string | null; firstName: string | null; lastName: string | null } | null;
}

interface SuppressionRow {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  source: string;
  createdAt: Date;
  tenant: { tenantId: string; companyName: string } | null;
}

/** ADR "ID boundary": the author is named by their public `userId`; no Int key leaves. */
export function toOutboundAllowEntry(row: AllowEntryRow): OutboundAllowEntry {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy
      ? {
          userId: row.createdBy.userId,
          email: row.createdBy.email,
          firstName: row.createdBy.firstName,
          lastName: row.createdBy.lastName,
        }
      : null,
  };
}

/** The tenant is named by its public `tenantId`; the recipient was masked when the row was written. */
export function toOutboundSuppression(row: SuppressionRow): OutboundSuppression {
  return {
    id: row.id,
    channel: row.channel as OutboundChannel,
    recipient: row.recipient,
    subject: row.subject,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    tenant: row.tenant ? { tenantId: row.tenant.tenantId, companyName: row.tenant.companyName } : null,
  };
}
