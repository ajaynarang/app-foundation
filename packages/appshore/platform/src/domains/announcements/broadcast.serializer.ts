import type { Announcement, AnnouncementPriority, AnnouncementStatus } from '@appshore/db';

/**
 * Broadcasts out of the API, named by their public id (`publicId` — the `/admin/broadcasts/:id`
 * id and the list cursor tiebreak). The Int PK never leaves; the author is named by their public `userId`,
 * never the User PK (`createdById` stays inside).
 */
export const BROADCAST_AUTHOR_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

/** The live banner never shows more than this many at once — cut AFTER the audience filter and the priority sort. */
export const ACTIVE_BROADCAST_CAP = 20;
/**
 * Live broadcasts read per cache fill — a ceiling far above any real live count, so the per-tenant filter and the
 * CRITICAL-first sort run over every live broadcast and a targeted or critical one is never cut before it.
 */
export const ACTIVE_BROADCAST_SCAN_CAP = 500;

type BroadcastRow = Announcement & {
  createdBy?: { userId: string; firstName: string; lastName: string; email: string | null } | null;
};

export interface BroadcastResponse {
  publicId: string;
  title: string;
  body: string;
  targetType: string;
  targetIds: string[];
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { userId: string; firstName: string; lastName: string; email: string | null } | null;
}

export function toPublicBroadcast(row: BroadcastRow): BroadcastResponse {
  const author = row.createdBy;
  return {
    publicId: row.publicId,
    title: row.title,
    body: row.body,
    targetType: row.targetType,
    targetIds: row.targetIds,
    status: row.status,
    priority: row.priority,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: author
      ? { userId: author.userId, firstName: author.firstName, lastName: author.lastName, email: author.email }
      : null,
  };
}
