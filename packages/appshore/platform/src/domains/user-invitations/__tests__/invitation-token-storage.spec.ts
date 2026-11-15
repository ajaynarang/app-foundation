import { readFileSync } from 'fs';
import { join } from 'path';
import { hashToken } from '../../../auth/token-hash';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { UserInvitationsService } from '../user-invitations.service';

/**
 * An invitation token is a bearer secret: whoever holds it can accept. The database holds only its sha256, the token
 * travels only in the link sent to the invitee, and no answer to the inviter carries it. These tests fail if a
 * plain-text column comes back, if the service stores or returns the token, or if a lookup stops going through the
 * hash. (ADR-0012, "Recognised, so hashed".)
 */
describe('Invitation token storage', () => {
  const dbRoot = join(__dirname, '../../../../../db/prisma');

  describe('schema', () => {
    const schema = readFileSync(join(dbRoot, 'schema/foundation.prisma'), 'utf8');
    const start = schema.indexOf('model UserInvitation {');
    const model = schema.slice(start, schema.indexOf('\n}', start));

    it('stores a 64-character hash and when a link was shared, and no token column', () => {
      expect(start).toBeGreaterThan(-1);
      expect(model).toMatch(/\btokenHash\s+String\s+@unique @map\("token_hash"\) @db\.VarChar\(64\)/);
      expect(model).toMatch(/\blinkSharedAt\s+DateTime\?/);
      expect(model).not.toMatch(/^\s*token\s+String/m);
    });

    it('the migration hashes stored tokens with the expression hashToken matches, then drops the plain column', () => {
      const sql = readFileSync(join(dbRoot, 'migrations/20261116000000_invitation_token_hash/migration.sql'), 'utf8');
      expect(sql).toContain(`SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')`);
      // Every pending link that exists today may have been read by its inviter.
      expect(sql).toContain(`SET "link_shared_at" = "created_at" WHERE "status" = 'PENDING'`);
      expect(sql).toMatch(/DROP COLUMN "token"/);
      expect(sql).toContain('CREATE UNIQUE INDEX "user_invitations_token_hash_key"');
    });
  });

  describe('service', () => {
    const prisma = createMockPrisma();
    // The shared mock does not list WorkspaceMember; the invite reads it to refuse a current member.
    prisma.workspaceMember = { findFirst: jest.fn(), upsert: jest.fn() };
    const email = { sendUserInvitation: jest.fn() };
    const sms = { sendSms: jest.fn() };
    let service: UserInvitationsService;

    const created = (data: Record<string, unknown>) => ({
      id: 9,
      invitationId: 'inv_9',
      tenantId: 1,
      invitedBy: 1,
      email: 'invitee@example.com',
      phone: null,
      inviteChannel: 'EMAIL',
      firstName: 'Pat',
      lastName: 'Lee',
      role: 'MEMBER',
      status: 'PENDING',
      expiresAt: new Date(),
      acceptedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      linkSharedAt: null,
      invitedByUser: { userId: 'user_owner', email: 'owner@example.com', firstName: 'O', lastName: 'W' },
      tenant: { companyName: 'Acme' },
      ...data,
    });

    beforeEach(() => {
      jest.clearAllMocks();
      service = new UserInvitationsService(
        prisma as any,
        email as any,
        sms as any,
        {} as any,
        {} as any,
        { get: () => 'https://app.example.com' } as any,
        { assertUserSeatAvailable: async () => undefined } as any,
        {} as any,
        { issue: async () => undefined } as any,
      );
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'ten_1' });
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.workspaceMember.findFirst.mockResolvedValue(null);
      prisma.userInvitation.findFirst.mockResolvedValue(null);
      prisma.userInvitation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(created(data)),
      );
    });

    const invite = (dto: Record<string, unknown>) =>
      service.inviteUser({ firstName: 'Pat', lastName: 'Lee', role: 'MEMBER', ...dto } as any, {
        userId: 'user_owner',
        role: 'OWNER',
        tenantId: 'ten_1',
      });

    it('create stores only the hash; the emailed token is the one whose hash was stored', async () => {
      const answer = await invite({ email: 'invitee@example.com' });

      const { data } = prisma.userInvitation.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('token');
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      const emailedToken = email.sendUserInvitation.mock.calls[0][5] as string;
      expect(hashToken(emailedToken)).toBe(data.tokenHash);
      expect(JSON.stringify(data)).not.toContain(emailedToken);
      // The inviter's answer has no link: an inviter who could read the token could accept as the invitee.
      expect(answer).not.toHaveProperty('inviteLink');
      expect(JSON.stringify(answer)).not.toContain(emailedToken);
      expect(JSON.stringify(answer)).not.toContain(data.tokenHash);
    });

    it('an SMS invite texts the link whose token hashes to the stored hash, and answers no link', async () => {
      const answer = await invite({ phone: '+15551234567' });

      const { data } = prisma.userInvitation.create.mock.calls[0][0];
      const texted = new URL((sms.sendSms.mock.calls[0][1] as string).split(': ').pop() as string);
      expect(hashToken(texted.searchParams.get('token') as string)).toBe(data.tokenHash);
      expect(answer).not.toHaveProperty('inviteLink');
    });

    it.each([
      ['tenantDbIdForToken', (raw: string) => service.tenantDbIdForToken(raw)],
      ['previewInvitation', (raw: string) => service.previewInvitation(raw)],
      ['acceptInvitation', (raw: string) => service.acceptInvitation({ token: raw, password: 'Password123!' })],
      ['joinInvitation', (raw: string) => service.joinInvitation(raw, 1)],
      [
        'acceptPhoneInvitation',
        (raw: string) => service.acceptPhoneInvitation({ token: raw, phone: '+15551234567', otp: '1', pin: '1234' }),
      ],
    ])('%s looks the token up by its hash, never by the raw value', async (_name, call) => {
      prisma.userInvitation.findUnique.mockResolvedValue(null);

      await call('raw-presented-token').catch(() => undefined);

      const { where } = prisma.userInvitation.findUnique.mock.calls[0][0];
      expect(where).toEqual({ tokenHash: hashToken('raw-presented-token') });
      expect(JSON.stringify(where)).not.toContain('raw-presented-token');
    });
  });
});
