import { All, Controller, Req, Res, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Request, Response } from 'express';
import { serve } from 'inngest/express';

import { Public } from '../../../../auth/decorators/public.decorator';
import { createDeskSchedulerFunction } from '../scheduler/desk-scheduler.function';
import { InngestClientService } from './inngest.client';

/**
 * Exposes `GET/POST/PUT /api/v1/inngest` — the single HTTP handler that
 * Inngest Cloud (or the local Inngest dev server) calls back into to:
 *   - Register Desk functions on deploy (PUT sync)
 *   - Dispatch function runs (POST with signed payload)
 *   - Introspect functions (GET)
 *
 * Registered functions:
 *   - deskSchedulerFunction    — cron `* * * * *` (every minute) heartbeat
 *
 * The starter ships NO responsibility workflow functions (the registry is
 * empty). When you add a responsibility, build its Inngest function (one per
 * responsibility, listening for `<app>/desk.<key>.run`) and push it into the
 * `responsibilityFunctions` array below.
 *
 * NOTE: path is `inngest` (not `api/inngest`) because main.ts sets a
 * global prefix of `api/v1`. The resulting public URL is `/api/v1/inngest`.
 * The Inngest dev server (docker) is configured to hit that path.
 *
 * The serve handler is built in `onApplicationBootstrap` — NOT in
 * `onModuleInit` and NOT lazily on first request.
 *
 *   - `onModuleInit` races `InngestClientService.onModuleInit`: Nest's
 *     init ordering depends on the dependency graph, and this controller
 *     can run before the service populates its `_client`, yielding
 *     "Cannot read properties of undefined (reading 'createFunction')".
 *   - Lazy first-request init pinned the first-ever function closure onto
 *     the instance, so hot-reload edits to a responsibility's function were
 *     invisible to the Inngest dev server.
 *   - `onApplicationBootstrap` fires after all modules have initialized
 *     but before `app.listen()`, so the Inngest client is fully set up
 *     AND the handler is fresh per process start.
 */
@Controller('inngest')
export class InngestController implements OnApplicationBootstrap {
  private readonly logger = new Logger(InngestController.name);
  private handler!: ReturnType<typeof serve>;

  constructor(private readonly inngest: InngestClientService) {}

  onApplicationBootstrap() {
    const client = this.inngest.client;

    // Register your responsibility workflow functions here, e.g.:
    //   createWelcomeFunction(client),
    const responsibilityFunctions: ReturnType<typeof createDeskSchedulerFunction>[] = [];

    const functions = [...responsibilityFunctions, createDeskSchedulerFunction(client)];

    // `serveOrigin` is the origin Inngest uses when POSTing back to run
    // a step. In local dev the Inngest dev server runs in Docker, so
    // it needs `host.docker.internal` (not `localhost`, which would
    // resolve to the container itself). Set INNGEST_SERVE_ORIGIN in
    // Doppler for staging/prod; default matches docker-compose setup.
    const serveOrigin = process.env.INNGEST_SERVE_ORIGIN ?? 'http://host.docker.internal:8001';

    this.handler = serve({ client, functions, serveOrigin, servePath: '/api/v1/inngest' });
    this.logger.log(
      `Inngest serve handler registered at ${serveOrigin}/api/v1/inngest (${functions.length} function${functions.length === 1 ? '' : 's'})`,
    );
  }

  /**
   * Marked @Public() to bypass the global JwtAuthGuard — Inngest has its
   * own auth model (signing-key verification on POSTs in cloud; dev server
   * is unauthenticated). Never call this endpoint from a user session.
   */
  @Public()
  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
