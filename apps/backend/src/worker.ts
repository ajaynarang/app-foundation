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
 * so BOTH processes consume every BullMQ queue — there is no worker-mode
 * gate that disables processors in the API process. Running this worker is
 * optional extra capacity, not a required separation. Inngest (Desk)
 * functions are the exception: they execute over HTTP via /api/inngest and
 * therefore run in the API process only.
 *
 * ECS task definition: command = ["node", "dist/worker.js"]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { initializeFirebase } from '@appshore/platform/config/firebase.config';
import { shutdownTelemetry } from '@appshore/kernel/infrastructure/telemetry/telemetry';

async function bootstrap() {
  initializeFirebase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

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
