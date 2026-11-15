import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { rlsStorage } from './rls-context';

/**
 * Opens an empty tenant-context holder for every HTTP request. The auth guards pin it to the caller's tenant with
 * `setRlsTenant`; a route nobody pins (a public route, a super-admin route without `@SystemScope`) keeps no context
 * and logs `rls.kind=none`.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    rlsStorage.run({}, next);
  }
}
