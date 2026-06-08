import { unique } from './common.js';

// ── Support factories (Phase 3 Group 3a) ──────────────────────────────────────
//
// Reconciled against:
//   - apps/backend/.../support/dto/create-ticket.dto.ts → CreateTicketDto
//     (required: subject, description; optional: category, priority,
//     conversationId, relatedEntities[])
//   - apps/backend/.../support/dto/create-message.dto.ts → CreateMessageDto
//     (required: content; optional: isInternal)
//   - apps/backend/.../support/dto/update-ticket.dto.ts → UpdateTicketDto
//     (all optional: status, priority, category)
//
// IMPORTANT field rename: the DTO uses `description` (NOT `message`). The
// spec document signature uses `message`; factory maps `message` → `description`.
// The UpdateTicketDto has NO `assignee` field despite the spec signature
// including one — factory drops unknown overrides to stay compatible with
// `whitelist + forbidNonWhitelisted`. TODO(phase-3-verify) on assignee growth.

export type SupportCategory = 'BILLING' | 'TECHNICAL' | 'FEATURE_REQUEST' | 'ACCOUNT' | 'INTEGRATION' | 'GENERAL';

export type SupportPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED';

/** POST /support/tickets body — `CreateTicketDto`. */
export interface SupportTicketPayload {
  subject: string;
  description: string;
  category?: SupportCategory;
  priority?: SupportPriority;
  conversationId?: number;
  relatedEntities?: Array<{ type: string; id: string; label?: string }>;
}

export function buildSupportTicket(
  overrides: Partial<{
    subject: string;
    category: SupportCategory;
    priority: SupportPriority;
    message: string;
    description: string;
    conversationId: number;
    relatedEntities: Array<{ type: string; id: string; label?: string }>;
  }> = {},
): SupportTicketPayload {
  return {
    subject: overrides.subject ?? `QA Ticket ${unique('TK')}`,
    description: overrides.description ?? overrides.message ?? 'Automated QA test ticket — safe to ignore.',
    category: overrides.category ?? 'GENERAL',
    priority: overrides.priority ?? 'LOW',
    ...(overrides.conversationId !== undefined ? { conversationId: overrides.conversationId } : {}),
    ...(overrides.relatedEntities !== undefined ? { relatedEntities: overrides.relatedEntities } : {}),
  };
}

/** POST /support/tickets/:id/messages body — `CreateMessageDto`. */
export interface SupportMessagePayload {
  content: string;
  isInternal?: boolean;
}

export function buildSupportMessage(overrides: Partial<SupportMessagePayload> = {}): SupportMessagePayload {
  return {
    content: `QA reply ${unique('MSG')}`,
    ...overrides,
  };
}

/**
 * PUT /support/admin/tickets/:id body — `UpdateTicketDto`.
 *
 * DTO fields are `status`, `priority`, `category`. The spec's `assignee`
 * param is DROPPED on the wire — no DTO field, and
 * `forbidNonWhitelisted: true` would 400. Accepted on the call signature for
 * future growth; silently ignored today. TODO(phase-3-verify).
 */
export interface UpdateTicketPayload {
  status?: SupportStatus;
  priority?: SupportPriority;
  category?: SupportCategory;
}

export function buildUpdateTicketPayload(
  overrides: Partial<{
    status: SupportStatus;
    priority: SupportPriority;
    category: SupportCategory;
    assignee: string;
  }> = {},
): UpdateTicketPayload {
  const payload: UpdateTicketPayload = {};
  if (overrides.status !== undefined) payload.status = overrides.status;
  if (overrides.priority !== undefined) payload.priority = overrides.priority;
  if (overrides.category !== undefined) payload.category = overrides.category;
  // `assignee` intentionally dropped — not a DTO field.
  return payload;
}
