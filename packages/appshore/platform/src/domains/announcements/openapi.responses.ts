import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementPriority, AnnouncementStatus } from '@appshore/db';

/** Who wrote a broadcast — named by their public `userId`, never the User PK. */
export class BroadcastAuthor {
  @ApiProperty({ description: 'Author public user id' })
  userId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;
}

/** A broadcast as the Super Admin console sees it (`toPublicBroadcast`). */
export class Broadcast {
  @ApiProperty({ description: 'Broadcast public id (uuid)' })
  publicId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ description: 'Audience: ALL, PLAN or TENANT', example: 'ALL' })
  targetType: string;

  @ApiProperty({ type: [String], description: 'Plan slugs (PLAN) or tenant ids (TENANT); empty for ALL' })
  targetIds: string[];

  @ApiProperty({ enum: AnnouncementStatus })
  status: AnnouncementStatus;

  @ApiProperty({ enum: AnnouncementPriority })
  priority: AnnouncementPriority;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;

  @ApiProperty({ type: BroadcastAuthor, nullable: true })
  createdBy: BroadcastAuthor | null;
}

/** `GET /admin/broadcasts` — a cursor list, newest first. */
export class BroadcastList {
  @ApiProperty({ type: [Broadcast] })
  items: Broadcast[];

  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last' })
  nextCursor: string | null;

  @ApiProperty({ description: 'Total matching broadcasts' })
  total: number;
}

/** A live broadcast for the in-app banner — the fields the banner reads, no author or audit stamps. */
export class ActiveBroadcast {
  @ApiProperty({ description: 'Broadcast public id (uuid)' })
  publicId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: AnnouncementPriority })
  priority: AnnouncementPriority;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: string | null;

  @ApiProperty({ description: 'Audience: ALL, PLAN or TENANT', example: 'ALL' })
  targetType: string;

  @ApiProperty({ type: [String] })
  targetIds: string[];
}
