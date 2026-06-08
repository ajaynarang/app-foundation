import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BullBoardAuthMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Dev bypass: set BULL_BOARD_AUTH=false in .env.local to skip auth.
    // Both checks use process.env directly — this is an intentional debug
    // flag outside the typed config schema and should never appear in production.
    if (process.env.NODE_ENV !== 'production' && process.env.BULL_BOARD_AUTH === 'false') {
      return next();
    }

    const token = this.extractToken(req);

    if (!token) {
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
      return;
    }

    try {
      const payload = this.jwtService.verify<{ role: string }>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      if (payload.role !== UserRole.SUPER_ADMIN) {
        this.logger.warn(`Bull Board access denied: role '${payload.role}' is not SUPER_ADMIN`);
        res.status(403).json({
          statusCode: 403,
          message: 'Forbidden: SUPER_ADMIN required',
        });
        return;
      }

      next();
    } catch (err: unknown) {
      const name = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.logger.warn(`Bull Board auth failed: ${name}`);
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    }
  }

  private extractToken(req: Request): string | null {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }
}
