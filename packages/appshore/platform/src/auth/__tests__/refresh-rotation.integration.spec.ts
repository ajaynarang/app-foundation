import { UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { LoginFailReason, PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as crypto from 'crypto';
import { JwtTokenService, type TokenPair } from '../jwt.service';
import { LoginEventService } from '../login-event.service';
import { RefreshSessionService } from '../refresh-session.service';
import { WorkspacesService } from '../../domains/workspaces/workspaces.service';

/**
 * Refresh-token rotation against real Postgres: the token service, the refresh path and the workspace switch, with
 * real rows. The unit specs prove which queries are issued; this proves the rows end up the way the rules say.
 *
 * Skipped when DATABASE_URL is unset or names no usable database. Every row a run writes hangs off two tenants and
 * one user it creates, and is deleted with them in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
]);
const isNoDatabase = (err: unknown) => NO_DATABASE_CODES.has((err as { code?: string }).code ?? '');

const REFRESH_SECRET = 'refresh-rotation-spec-refresh-secret-32-chars';
const ACCESS_SECRET = 'refresh-rotation-spec-access-secret-32-chars';
const meta = { ip: null, userAgent: 'refresh-rotation-spec' };

describe('Refresh-token rotation (Postgres)', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;
  let dbReachable = false;
  let config: Record<string, unknown>;
  let nestJwt: NestJwtService;
  let tokens: JwtTokenService;
  let sessions: RefreshSessionService;
  let workspaces: WorkspacesService;
  const suffix = crypto.randomBytes(4).toString('hex');
  let tenantX: { id: number; tenantId: string };
  let tenantY: { id: number; tenantId: string };
  let user: { id: number; userId: string; email: string | null };

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('refresh-rotation.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 6 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.refreshToken.count({ where: { familyId: 'none' } });
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`refresh-rotation.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }

    const makeTenant = (name: string) =>
      prisma.tenant.create({
        data: {
          tenantId: `ten_rr_${name}_${suffix}`,
          companyName: `Rotation ${name}`,
          isActive: true,
          status: 'ACTIVE',
        },
        select: { id: true, tenantId: true },
      });
    tenantX = await makeTenant('x');
    tenantY = await makeTenant('y');
    user = await prisma.user.create({
      data: {
        userId: `user_rr_${suffix}`,
        email: `rotation-${suffix}@example.com`,
        firstName: 'Rotation',
        lastName: 'Spec',
        role: 'ADMIN',
        tenantId: tenantX.id,
        isActive: true,
      },
      select: { id: true, userId: true, email: true },
    });
    await prisma.workspaceMember.createMany({
      data: [
        { userId: user.id, tenantId: tenantX.id, role: 'ADMIN', isDefault: true },
        { userId: user.id, tenantId: tenantY.id, role: 'MEMBER', isDefault: false },
      ],
    });
  }, 30_000);

  beforeEach(() => {
    if (!dbReachable) return;
    config = {
      'jwt.accessSecret': ACCESS_SECRET,
      'jwt.refreshSecret': REFRESH_SECRET,
      'jwt.accessExpiry': '15m',
      'jwt.refreshExpiry': '7d',
      'jwt.sessionMaxAge': '30d',
      'jwt.refreshReuseGraceSeconds': 0,
      multiTenancy: { enabled: true, implicitTenantId: 1, mode: 'multi' },
    };
    const configService = { get: (key: string) => config[key] } as any;
    nestJwt = new NestJwtService({});
    tokens = new JwtTokenService(nestJwt, configService, prisma as any);
    sessions = new RefreshSessionService(prisma as any, tokens, new LoginEventService(prisma as any), configService);
    workspaces = new WorkspacesService(prisma as any, tokens);
  });

  afterAll(async () => {
    if (dbReachable) {
      // Cascades remove the user's refresh tokens, login events and memberships.
      if (user) await prisma.user.deleteMany({ where: { id: user.id } });
      await prisma.tenant.deleteMany({ where: { tenantId: { in: [tenantX?.tenantId, tenantY?.tenantId] } } });
    }
    await prisma?.$disconnect();
    await pool?.end();
  });

  const login = () =>
    tokens.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: 'ADMIN',
        tenantId: tenantX.tenantId,
        tenantDbId: tenantX.id,
      },
      'email_password',
    );

  /** What the refresh route does with a cookie: verify the signature, validate the row, rotate. */
  const refresh = async (refreshToken: string) => {
    const payload = nestJwt.verify<{ tokenId: string }>(refreshToken, { secret: REFRESH_SECRET });
    const session = await sessions.validatePresentedToken(payload.tokenId, refreshToken, meta);
    return sessions.refresh(session);
  };
  const accessClaims = (accessToken: string) =>
    nestJwt.verify<{ sid: string; tenantId?: string; role: string }>(accessToken, { secret: ACCESS_SECRET });
  const row = (tokenId: string) => prisma.refreshToken.findUniqueOrThrow({ where: { tokenId } });
  const liveTokens = (familyId: string) =>
    prisma.refreshToken.findMany({ where: { familyId, isRevoked: false }, select: { tokenId: true } });
  const tokenIdOf = (pair: { refreshToken: string }) =>
    nestJwt.verify<{ tokenId: string }>(pair.refreshToken, { secret: REFRESH_SECRET }).tokenId;

  it('every refresh issues a successor in the same family; the access token sid is the family', async () => {
    if (!dbReachable) return;
    const first = await login();
    const next = await refresh(first.refreshToken);

    const successor = await row(tokenIdOf(next));
    expect(successor.familyId).toBe(first.refreshTokenId);
    expect(successor.previousTokenId).toBe(first.refreshTokenId);
    expect(accessClaims(next.accessToken).sid).toBe(first.refreshTokenId);
    expect(nestJwt.decode<{ prev?: string }>(next.refreshToken).prev).toBe(first.refreshTokenId);
    // The presented token is not cut short at rotation.
    expect((await row(first.refreshTokenId)).isRevoked).toBe(false);
    expect((await row(first.refreshTokenId)).lastUsedAt).not.toBeNull();
  });

  it('a lost successor does not log the client out', async () => {
    if (!dbReachable) return;
    const first = await login();
    await refresh(first.refreshToken); // the response carrying this successor never arrives

    const retry = await refresh(first.refreshToken);

    expect(retry.accessToken).toBeTruthy();
    expect((await row(tokenIdOf(retry))).familyId).toBe(first.refreshTokenId);
  });

  it('presenting the successor retires its predecessor', async () => {
    if (!dbReachable) return;
    const first = await login();
    const second = await refresh(first.refreshToken);
    await refresh(second.refreshToken);

    const retired = await row(first.refreshTokenId);
    expect(retired.isRevoked).toBe(true);
    expect(retired.rotatedAt).not.toBeNull();
    expect(retired.revokedAt?.getTime()).toBe(retired.rotatedAt?.getTime());
  });

  it('two concurrent refreshes leave one live token of that generation after the next refresh', async () => {
    if (!dbReachable) return;
    const first = await login();
    const [a, b] = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
    const third = await refresh(b.refreshToken);

    expect((await row(tokenIdOf(a))).isRevoked).toBe(true); // the sibling, retired with the predecessor
    expect((await row(first.refreshTokenId)).isRevoked).toBe(true);
    expect((await liveTokens(first.refreshTokenId)).map((t) => t.tokenId).sort()).toEqual(
      [tokenIdOf(b), tokenIdOf(third)].sort(),
    );
  });

  it('a retired token revokes the family, records REFRESH_REUSE, and leaves other sessions alone', async () => {
    if (!dbReachable) return;
    const other: TokenPair = await login();
    const first = await login();
    const second = await refresh(first.refreshToken);
    await refresh(second.refreshToken); // retires `first`

    await expect(refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(await liveTokens(first.refreshTokenId)).toEqual([]);
    expect(await liveTokens(other.familyId)).toHaveLength(1);
    const reuse = await prisma.loginEvent.findMany({
      where: { userId: user.id, failReason: LoginFailReason.REFRESH_REUSE },
    });
    expect(reuse.length).toBeGreaterThanOrEqual(1);
    await expect(refresh(other.refreshToken)).resolves.toBeTruthy();
  });

  it('a retired token presented within the grace window gets a 401 and the family survives', async () => {
    if (!dbReachable) return;
    config['jwt.refreshReuseGraceSeconds'] = 60;
    const first = await login();
    const second = await refresh(first.refreshToken);
    const third = await refresh(second.refreshToken); // retires `first`

    await expect(refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);

    expect((await liveTokens(first.refreshTokenId)).length).toBeGreaterThan(0);
    await expect(refresh(third.refreshToken)).resolves.toBeTruthy();
  });

  describe('the refresh step is atomic with validation', () => {
    const validate = (refreshToken: string) => {
      const payload = nestJwt.verify<{ tokenId: string }>(refreshToken, { secret: REFRESH_SECRET });
      return sessions.validatePresentedToken(payload.tokenId, refreshToken, meta);
    };
    const reuseEvents = () =>
      prisma.loginEvent.count({ where: { userId: user.id, failReason: LoginFailReason.REFRESH_REUSE } });

    it('a family revoked after the token was validated gets no new live token', async () => {
      if (!dbReachable) return;
      const first = await login();
      const session = await validate(first.refreshToken);

      await tokens.revokeFamily(first.familyId, user.id); // a reuse elsewhere, or a logout, lands in between

      await expect(sessions.refresh(session)).rejects.toThrow(UnauthorizedException);
      expect(await liveTokens(first.familyId)).toEqual([]);
    });

    it('a family revoked while a refresh is in flight never keeps a live token', async () => {
      if (!dbReachable) return;
      const first = await login();
      const session = await validate(first.refreshToken);
      // Pause the refresh after it wrote the successor and before its transaction commits.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const issue = (tokens as any).issue.bind(tokens);
      jest.spyOn(tokens as any, 'issue').mockImplementation(async (...args: unknown[]) => {
        const pair = await issue(...args);
        await gate;
        return pair;
      });

      const refreshing = sessions.refresh(session);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const revoking = tokens.revokeFamily(first.familyId, user.id); // a reuse elsewhere, or a logout
      await new Promise((resolve) => setTimeout(resolve, 150));
      release();
      await Promise.allSettled([refreshing, revoking]);

      expect(await liveTokens(first.familyId)).toEqual([]);
    });

    it('a token retired as a sibling while it is being refreshed cannot start an orphan chain', async () => {
      if (!dbReachable) return;
      const first = await login();
      const [a, b] = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
      const sessionB = await validate(b.refreshToken); // B passes validation...

      const fromA = await refresh(a.refreshToken); // ...then A is presented and retires B as its sibling

      await expect(sessions.refresh(sessionB)).rejects.toThrow(UnauthorizedException);
      expect(await prisma.refreshToken.count({ where: { previousTokenId: tokenIdOf(b) } })).toBe(0);
      expect((await liveTokens(first.familyId)).map((t) => t.tokenId).sort()).toEqual(
        [tokenIdOf(a), tokenIdOf(fromA)].sort(),
      );
    });

    it('a retired token presented after the family was fully revoked is a plain 401, not reuse', async () => {
      if (!dbReachable) return;
      const first = await login();
      const second = await refresh(first.refreshToken);
      await refresh(second.refreshToken); // retires `first` by rotation
      await tokens.revokeFamily(first.familyId, user.id); // logout
      const before = await reuseEvents();

      await expect(refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);

      expect(await reuseEvents()).toBe(before);
    });
  });

  it('presenting a workspace switch successor retires the token the client held, not only the newest row', async () => {
    if (!dbReachable) return;
    const first = await login();
    const held = await refresh(first.refreshToken); // the client holds this one
    await refresh(held.refreshToken); // a successor whose response was lost: the newest live row

    const switched = await workspaces.switch(user.id, tenantY.tenantId, { familyId: first.familyId });
    const afterSwitch = await refresh(switched.refreshToken);

    expect((await row(tokenIdOf(held))).isRevoked).toBe(true);
    expect((await liveTokens(first.familyId)).map((t) => t.tokenId).sort()).toEqual(
      [tokenIdOf(switched), tokenIdOf(afterSwitch)].sort(),
    );

    await workspaces.switch(user.id, tenantX.tenantId, {});
  });

  it('a token that does not match the stored hash is refused', async () => {
    if (!dbReachable) return;
    const first = await login();
    // Validly signed, names the real row, but is not the token that row stores.
    const forged = nestJwt.sign(
      { sub: user.userId, tokenId: first.refreshTokenId, forged: true },
      { secret: REFRESH_SECRET, expiresIn: 600 },
    );

    await expect(refresh(forged)).rejects.toThrow(UnauthorizedException);
    expect((await row(first.refreshTokenId)).isRevoked).toBe(false);
  });

  it('a workspace switch in session A does not move session B on refresh', async () => {
    if (!dbReachable) return;
    const sessionA = await login();
    const sessionB = await login();

    const switched = await workspaces.switch(user.id, tenantY.tenantId, { familyId: sessionA.familyId });
    const switchedRow = await row(tokenIdOf(switched));
    expect(switchedRow.familyId).toBe(sessionA.familyId);
    expect(switchedRow.tenantId).toBe(tenantY.id);

    const b = await refresh(sessionB.refreshToken);
    expect(accessClaims(b.accessToken)).toMatchObject({ tenantId: tenantX.tenantId, role: 'ADMIN' });

    const a = await refresh(switched.refreshToken);
    expect(accessClaims(a.accessToken)).toMatchObject({
      tenantId: tenantY.tenantId,
      role: 'MEMBER',
      sid: sessionA.familyId,
    });

    // Put the login default back for the other cases.
    await workspaces.switch(user.id, tenantX.tenantId, {});
  });

  it('a removed membership fails the refresh of a session in that workspace', async () => {
    if (!dbReachable) return;
    const session = await login();
    const switched = await workspaces.switch(user.id, tenantY.tenantId, { familyId: session.familyId });
    await workspaces.switch(user.id, tenantX.tenantId, {}); // login default back to X, as another session would
    await prisma.workspaceMember.deleteMany({ where: { userId: user.id, tenantId: tenantY.id } });
    try {
      await expect(refresh(switched.refreshToken)).rejects.toThrow(UnauthorizedException);
    } finally {
      await prisma.workspaceMember.create({
        data: { userId: user.id, tenantId: tenantY.id, role: 'MEMBER', isDefault: false },
      });
    }
  });

  it('logout revokes the whole family', async () => {
    if (!dbReachable) return;
    const first = await login();
    await refresh(first.refreshToken);

    await tokens.revokeFamily(first.familyId, user.id);

    expect(await liveTokens(first.familyId)).toEqual([]);
  });

  it('a family past its absolute lifetime cannot refresh', async () => {
    if (!dbReachable) return;
    const first = await login();
    await prisma.refreshToken.update({
      where: { tokenId: first.refreshTokenId },
      data: { familyStartedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    await expect(refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
  });
});
