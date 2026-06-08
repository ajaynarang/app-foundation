import { Test, TestingModule } from '@nestjs/testing';
import { BullBoardAuthMiddleware } from '../bull-board-auth.middleware';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

// Use string literals to avoid requiring generated Prisma client in the test environment
const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
} as const;

const mockJwtService = {
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'jwt.accessSecret') return 'test-secret';
    return undefined;
  }),
};

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function buildRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  return { res, status, json };
}

describe('BullBoardAuthMiddleware', () => {
  let middleware: BullBoardAuthMiddleware;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBullBoardAuth = process.env.BULL_BOARD_AUTH;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BullBoardAuthMiddleware,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    middleware = module.get<BullBoardAuthMiddleware>(BullBoardAuthMiddleware);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBullBoardAuth === undefined) {
      delete process.env.BULL_BOARD_AUTH;
    } else {
      process.env.BULL_BOARD_AUTH = originalBullBoardAuth;
    }
  });

  describe('dev bypass', () => {
    it('calls next() when BULL_BOARD_AUTH=false in non-production', () => {
      process.env.NODE_ENV = 'development';
      process.env.BULL_BOARD_AUTH = 'false';

      const req = buildReq();
      const { res } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does NOT bypass when NODE_ENV=production even if BULL_BOARD_AUTH=false', () => {
      process.env.NODE_ENV = 'production';
      process.env.BULL_BOARD_AUTH = 'false';

      const req = buildReq(); // no token
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });

    it('does NOT bypass when BULL_BOARD_AUTH is not set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BULL_BOARD_AUTH;

      const req = buildReq(); // no token
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });
  });

  describe('missing token', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns 401 when no Authorization header and no cookie', () => {
      const req = buildReq({ headers: {}, cookies: {} });
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });

    it('returns 401 when Authorization header is not Bearer format', () => {
      const req = buildReq({
        headers: { authorization: 'Basic abc123' },
      });
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });
  });

  describe('invalid / expired token', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns 401 when JwtService.verify throws (malformed token)', () => {
      mockJwtService.verify.mockImplementation(() => {
        const err = new Error('invalid signature');
        err.name = 'JsonWebTokenError';
        throw err;
      });

      const req = buildReq({
        headers: { authorization: 'Bearer bad.token.here' },
      });
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });

    it('returns 401 when JwtService.verify throws (expired token)', () => {
      mockJwtService.verify.mockImplementation(() => {
        const err = new Error('jwt expired');
        err.name = 'TokenExpiredError';
        throw err;
      });

      const req = buildReq({
        headers: { authorization: 'Bearer expired.token.here' },
      });
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });
    });
  });

  describe('insufficient role', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns 403 when token is valid but role is ADMIN', () => {
      mockJwtService.verify.mockReturnValue({
        role: ROLE.ADMIN,
        sub: 'user-1',
      });

      const req = buildReq({
        headers: { authorization: 'Bearer valid.admin.token' },
      });
      const { res, status, json } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        statusCode: 403,
        message: 'Forbidden: SUPER_ADMIN required',
      });
    });

    it('returns 403 when token is valid but role is OWNER', () => {
      mockJwtService.verify.mockReturnValue({
        role: ROLE.OWNER,
        sub: 'user-2',
      });

      const req = buildReq({
        headers: { authorization: 'Bearer valid.owner.token' },
      });
      const { res, status } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(status).toHaveBeenCalledWith(403);
    });
  });

  describe('authorized SUPER_ADMIN', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('calls next() when token is valid and role is SUPER_ADMIN', () => {
      mockJwtService.verify.mockReturnValue({
        role: ROLE.SUPER_ADMIN,
        sub: 'super-user-1',
      });

      const req = buildReq({
        headers: { authorization: 'Bearer valid.super.token' },
      });
      const { res } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('passes the correct access secret to JwtService.verify', () => {
      mockJwtService.verify.mockReturnValue({ role: ROLE.SUPER_ADMIN });

      const req = buildReq({
        headers: { authorization: 'Bearer some.token' },
      });
      const { res } = buildRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(mockJwtService.verify).toHaveBeenCalledWith('some.token', {
        secret: 'test-secret',
      });
    });
  });
});
