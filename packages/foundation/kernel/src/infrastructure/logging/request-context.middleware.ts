import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  jobName?: string;
  jobId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Validate incoming x-request-id to prevent log injection / spoofed correlation IDs.
    // Only trust it if it is a properly formatted UUID; otherwise generate a fresh one.
    const incomingId = req.headers['x-request-id'] as string | undefined;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const requestId = incomingId && uuidRegex.test(incomingId) ? incomingId : randomUUID();

    // Set response header so caller can correlate
    res.setHeader('x-request-id', requestId);

    // Extract tenant/user from JWT payload if already parsed by guards
    // Guards run after middleware, so these are populated on subsequent
    // log calls once the guard has set req.user
    const context: RequestContext = { requestId };

    requestContextStorage.run(context, () => {
      // Patch req so guards can enrich the context after auth
      (req as any).setLogContext = (patch: Partial<RequestContext>) => {
        Object.assign(context, patch);
      };
      next();
    });
  }
}
