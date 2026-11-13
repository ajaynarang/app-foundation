/**
 * Worker entry point — runs the same NestJS AppModule as the API
 * but without starting an HTTP listener.
 *
 * BullMQ queue processors (events, notifications, webhooks, ai-interactive,
 * ai-background, bulk-ops — see @appshore/kernel queue.constants.ts)
 * automatically register via their parent modules and begin consuming jobs
 * from Redis.
 *
 * Worker/API contract: both main.ts and worker.ts boot the same AppModule,
 * so by default BOTH processes consume every BullMQ queue. The API can be
 * made producer-only with QUEUE_PROCESSORS_ENABLED=false (the role switch in
 * @appshore/kernel/infrastructure/queue/queue-processing-mode, called from
 * main.ts only). This file never reads that key, so no value of it can stop
 * the worker. The switch ships off: with it unset the API consumes too, and
 * this worker is optional extra capacity. Turn it on only after a worker task
 * runs (Terraform `api_queue_processors_enabled = false` refuses while
 * `worker_desired_count` is 0). Desk workflow functions, in a product that
 * kept Desk, are the exception: they execute over HTTP and run in the API
 * process only.
 *
 * ECS task definition: command = ["node", "dist/worker.js"]
 */
// OpenTelemetry first: auto-instrumentation can only patch pg, ioredis and
// http if it loads before AppModule pulls them in.
import { shutdownTelemetry } from '@appshore/kernel/infrastructure/telemetry/telemetry';
// Error tracking second, before AppModule loads (a no-op without SENTRY_DSN).
import '@appshore/kernel/infrastructure/error-tracking/instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { initializeFirebase } from '@appshore/platform/config/firebase.config';
import { setProcessRole } from '@appshore/kernel/shared/utils/process-role';
import { armBootstrapLogWatchdog } from '@appshore/kernel/infrastructure/logging/bootstrap-log-watchdog';

async function bootstrap() {
  // Claimed before the app exists, so providers that ask during init see it.
  setProcessRole('worker');
  initializeFirebase();

  // bufferLogs holds every line until the app exists; if an init hook hangs,
  // the watchdog releases them and names the stall.
  const disarmLogWatchdog = armBootstrapLogWatchdog('App Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  disarmLogWatchdog();

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  logger.log('App Worker started — processing background jobs', 'Worker');

  process.on('SIGTERM', () => {
    void (async () => {
      logger.log('SIGTERM received — shutting down worker gracefully', 'Worker');
      await app.close();
      await shutdownTelemetry();
      process.exit(0);
    })();
  });
}

void bootstrap();
