import type { Feedback, FeedbackStatus } from '@appshore/db';

interface PersonRef {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

/** A feedback row as the API shows it — named by its public id; people and tenants by theirs. */
export interface PublicFeedback {
  feedbackId: string;
  category: string | null;
  sentiment: number;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  note: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: PersonRef & { email: string | null; role: string };
  tenant?: { tenantId: string; companyName: string | null };
  resolver?: PersonRef | null;
}

/** The relations the admin views load — public ids only, never the Int PKs. */
export const FEEDBACK_ADMIN_INCLUDE = {
  user: { select: { userId: true, firstName: true, lastName: true, email: true, role: true } },
  tenant: { select: { tenantId: true, companyName: true } },
  resolver: { select: { userId: true, firstName: true, lastName: true } },
} as const;

type FeedbackWithRefs = Feedback & {
  user?: PublicFeedback['user'];
  tenant?: PublicFeedback['tenant'];
  resolver?: PublicFeedback['resolver'];
};

export function toPublicFeedback(row: FeedbackWithRefs): PublicFeedback {
  return {
    feedbackId: row.publicId,
    category: row.category,
    sentiment: row.sentiment,
    message: row.message,
    page: row.page,
    status: row.status,
    note: row.note,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.user !== undefined && { user: row.user }),
    ...(row.tenant !== undefined && { tenant: row.tenant }),
    ...(row.resolver !== undefined && { resolver: row.resolver }),
  };
}
