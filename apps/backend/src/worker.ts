/**
 * Worker entry point — runs the same NestJS AppModule as the API
 * but without starting an HTTP listener.
 *
 * Bull queue processors (sync, ratecon, document-cleanup, lane-generation,
 * shield-audit, webhook-delivery, login-event-cleanup) automatically register
 * via their parent modules and begin consuming jobs from Redis.
 *
 * ECS task definition: command = ["node", "dist/worker.js"]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { initializeFirebase } from './config/firebase.config';
import { shutdownTelemetry } from './infrastructure/telemetry/telemetry';

async function bootstrap() {
  initializeFirebase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  logger.log('SALLY Worker started — processing background jobs', 'Worker');

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
