import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

/**
 * Issues, resolves, and revokes opaque session tokens for assistant conversations.
 *
 * Replaces the legacy `Conversation.sessionToken` column. Per the APP ID
 * convention (Rule 5, opaque tokens never live on the entity row), each
 * conversation session lives in its own row with proper expiry, revoke, and
 * audit fields.
 *
 * Today the only caller is the unauthenticated prospect (pre-signup lead-gen)
 * chat flow in `prospect.service.ts`. Authenticated conversations don't yet
 * issue session tokens — they authenticate via the user's JWT.
 */
@Injectable()
export class ConversationSessionService {
  private readonly logger = new Logger(ConversationSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async issue(conversationId: number, input: { expiresAt?: string }) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, tenantId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const token = nanoid(22);
    const session = await this.prisma.conversationSession.create({
      data: {
        conversationId: conversation.id,
        tenantId: conversation.tenantId,
        token,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    // DomainEventService.emit requires a numeric/string tenant id. Anonymous
    // prospect conversations have no tenant, so we emit under tenantId 0 — the
    // event is internal-only (no SSE bridge, no webhooks scoped by tenant).
    await this.events.emit(DOMAIN_EVENTS.CONVERSATION_SESSION_ISSUED, conversation.tenantId ?? 0, {
      conversationId: conversation.id,
      sessionId: session.id,
    });

    return session;
  }

  async revoke(sessionId: number) {
    const session = await this.prisma.conversationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Conversation session not found');
    if (session.revokedAt) return session;

    const updated = await this.prisma.conversationSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await this.events.emit(DOMAIN_EVENTS.CONVERSATION_SESSION_REVOKED, session.tenantId ?? 0, {
      conversationId: session.conversationId,
      sessionId: session.id,
    });

    return updated;
  }

  async resolveActive(token: string) {
    const session = await this.prisma.conversationSession.findUnique({ where: { token } });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt && session.expiresAt < new Date()) return null;

    return this.prisma.conversationSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
}
