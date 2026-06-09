import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConversationSessionService } from '../conversation-session.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../../infrastructure/events/domain-events.constants';

describe('ConversationSessionService', () => {
  let service: ConversationSessionService;
  let prisma: any;
  let events: jest.Mocked<DomainEventService>;

  const conversationId = 100;
  const tenantId = 7;

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
      },
      conversationSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    events = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DomainEventService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationSessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get<ConversationSessionService>(ConversationSessionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── issue ──

  describe('issue', () => {
    it('mints a 22-char nanoid token, no conv- prefix and no embedded conversationId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, createdAt: new Date() }),
      );

      const session = await service.issue(conversationId, {});

      expect(session.token).toHaveLength(22);
      expect(session.token).not.toContain('conv-');
      expect(session.token).not.toContain(String(conversationId));
    });

    it('persists the conversation tenantId on the session', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, createdAt: new Date() }),
      );

      await service.issue(conversationId, {});

      expect(prisma.conversationSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId, tenantId }),
        }),
      );
    });

    it('persists null tenantId for anonymous prospect conversations', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId: null });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, createdAt: new Date() }),
      );

      await service.issue(conversationId, {});

      expect(prisma.conversationSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId, tenantId: null }),
        }),
      );
    });

    it('persists optional expiresAt', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, createdAt: new Date() }),
      );

      await service.issue(conversationId, { expiresAt: '2030-01-01T00:00:00Z' });

      expect(prisma.conversationSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt: new Date('2030-01-01T00:00:00Z') }),
        }),
      );
    });

    it('emits app.conversation.session-issued', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 11, ...data, createdAt: new Date() }),
      );

      await service.issue(conversationId, {});

      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.CONVERSATION_SESSION_ISSUED,
        tenantId,
        expect.objectContaining({ conversationId, sessionId: 11 }),
      );
    });

    it('emits with tenantId 0 for anonymous conversations (DomainEventService requires non-null)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, tenantId: null });
      prisma.conversationSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 11, ...data, createdAt: new Date() }),
      );

      await service.issue(conversationId, {});

      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.CONVERSATION_SESSION_ISSUED,
        0,
        expect.objectContaining({ conversationId, sessionId: 11 }),
      );
    });

    it('throws NotFoundException when conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.issue(conversationId, {})).rejects.toThrow(NotFoundException);
      expect(prisma.conversationSession.create).not.toHaveBeenCalled();
    });
  });

  // ── revoke ──

  describe('revoke', () => {
    it('sets revokedAt and emits app.conversation.session-revoked', async () => {
      const session = { id: 9, conversationId, tenantId, revokedAt: null };
      prisma.conversationSession.findUnique.mockResolvedValue(session);
      prisma.conversationSession.update.mockImplementation(({ data }: any) => Promise.resolve({ ...session, ...data }));

      const revoked = await service.revoke(session.id);

      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.CONVERSATION_SESSION_REVOKED,
        tenantId,
        expect.objectContaining({ conversationId, sessionId: session.id }),
      );
    });

    it('is idempotent — already-revoked session returned without re-emitting', async () => {
      const alreadyRevoked = {
        id: 9,
        conversationId,
        tenantId,
        revokedAt: new Date('2026-01-01'),
      };
      prisma.conversationSession.findUnique.mockResolvedValue(alreadyRevoked);

      const result = await service.revoke(alreadyRevoked.id);

      expect(result).toBe(alreadyRevoked);
      expect(prisma.conversationSession.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown session id', async () => {
      prisma.conversationSession.findUnique.mockResolvedValue(null);

      await expect(service.revoke(9)).rejects.toThrow(NotFoundException);
    });
  });

  // ── resolveActive ──

  describe('resolveActive', () => {
    it('returns null for an unknown token', async () => {
      prisma.conversationSession.findUnique.mockResolvedValue(null);

      expect(await service.resolveActive('nope')).toBeNull();
    });

    it('returns null for a revoked token', async () => {
      prisma.conversationSession.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: new Date('2026-01-01'),
        expiresAt: null,
      });

      expect(await service.resolveActive('t')).toBeNull();
      expect(prisma.conversationSession.update).not.toHaveBeenCalled();
    });

    it('returns null for an expired token', async () => {
      prisma.conversationSession.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: null,
        expiresAt: new Date('2020-01-01'),
      });

      expect(await service.resolveActive('t')).toBeNull();
      expect(prisma.conversationSession.update).not.toHaveBeenCalled();
    });

    it('touches lastSeenAt and returns the updated session for a valid token', async () => {
      prisma.conversationSession.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: null,
        expiresAt: null,
      });
      prisma.conversationSession.update.mockResolvedValue({
        id: 1,
        token: 't',
        lastSeenAt: new Date(),
      });

      const resolved = await service.resolveActive('t');

      expect(resolved?.lastSeenAt).toBeInstanceOf(Date);
      expect(prisma.conversationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
        }),
      );
    });
  });
});
