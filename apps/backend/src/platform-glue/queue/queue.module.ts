import { Global, Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { JobService } from '@appshore/platform/infrastructure/queue/job.service';
import { JobCleanupJob } from '@appshore/platform/infrastructure/queue/job-cleanup.job';
import { BullBoardAuthMiddleware } from '@appshore/platform/infrastructure/queue/bull-board-auth.middleware';
import { VendorCircuitBreakerService } from '@appshore/platform/infrastructure/queue/vendor-circuit-breaker.service';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import { AiInteractivePlaceholderProcessor, AiBackgroundPlaceholderProcessor } from './placeholder.processors';
import { CacheModule } from '../cache/cache.module';

@Global()
@Module({
  imports: [
    CacheModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redisUrl');
        if (!redisUrl) throw new Error('redisUrl config is required (BullMQ)');
        const url = new URL(redisUrl);
        const isTls = url.protocol === 'rediss:';
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            ...(isTls && { tls: {} }),
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 10000,
            },
            removeOnComplete: {
              age: 86400, // 24 hours
            },
            removeOnFail: {
              age: 604800, // 7 days
            },
          },
        };
      },
    }),
    // All queues are registered centrally here. Domain modules import
    // QueueModule to gain access; no domain module calls
    // BullModule.registerQueue itself.
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EVENTS },
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.WEBHOOKS },
      { name: QUEUE_NAMES.AI_INTERACTIVE },
      { name: QUEUE_NAMES.AI_BACKGROUND },
      { name: QUEUE_NAMES.BULK_OPS },
    ),
    // Bull Board dashboard at /admin/queues — protected by BullBoardAuthMiddleware
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    // Register every queue with Bull Board so the UI surfaces them all.
    BullBoardModule.forFeature(
      { name: QUEUE_NAMES.EVENTS, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.NOTIFICATIONS, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.WEBHOOKS, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.AI_INTERACTIVE, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.AI_BACKGROUND, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.BULK_OPS, adapter: BullMQAdapter },
    ),
    // JwtModule is re-registered here because AuthModule does not export it.
    // BullBoardAuthMiddleware needs JwtService to verify access tokens but
    // QueueModule is not a child of AuthModule, so we register JwtModule
    // independently with the same access secret.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
      }),
    }),
  ],
  providers: [
    JobService,
    JobCleanupJob,
    BullBoardAuthMiddleware,
    VendorCircuitBreakerService,
    DeadLetterService,
    AiInteractivePlaceholderProcessor,
    AiBackgroundPlaceholderProcessor,
  ],
  exports: [BullModule, JobService, JobCleanupJob, VendorCircuitBreakerService, DeadLetterService],
})
export class QueueModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(BullBoardAuthMiddleware).forRoutes({ path: '/admin/queues/(.*)', method: RequestMethod.ALL });
  }
}
