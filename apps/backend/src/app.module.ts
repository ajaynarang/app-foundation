import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from '@appshore/platform/shared/filters/http-exception.filter';
import configuration from './config/configuration';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AuthModule } from '@appshore/platform/auth/auth.module';
import { JwtAuthGuard } from '@appshore/platform/auth/guards/jwt-auth.guard';
import { TenantGuard } from '@appshore/platform/auth/guards/tenant.guard';
import { RolesGuard } from '@appshore/platform/auth/guards/roles.guard';
import {
  RequestContextMiddleware,
  requestContextStorage,
} from '@appshore/kernel/infrastructure/logging/request-context.middleware';
import { PlanGuard } from '@appshore/platform/auth/guards/plan.guard';
import { shouldSkipRequestLog, maskUrlSecrets } from '@appshore/kernel/infrastructure/logging/log-filter';
import { getActiveTraceContext } from '@appshore/kernel/infrastructure/logging/trace-context';
import { buildPinoTransport } from '@appshore/kernel/infrastructure/logging/pino-transport';

// Domain Modules
import { PlatformModule } from './platform-glue/platform.module';
import { PlatformHooksModule } from './platform-glue/hooks.module';
import { IntegrationsModule } from './domains/integrations/integrations.module';
import { AiModule } from './domains/ai/ai.module';
import { AdminJobsModule } from './domains/admin/admin-jobs.module';
import { AdminEventsModule } from './domains/admin/admin-events.module';
import { AdminAiSpendModule } from './domains/admin/admin-ai-spend.module';
import { BillingModule } from './domains/billing/billing.module';
import { DeskModule } from './domains/desk/desk.module';

// Infrastructure Modules
import { CacheModule } from './platform-glue/cache/cache.module';
import { SharedModule } from './shared/shared.module';
import { NotificationModule } from '@appshore/platform/infrastructure/notification/notification.module';
import { SseModule } from './platform-glue/sse/sse.module';
import { PushModule } from '@appshore/platform/infrastructure/push/push.module';
import { SmsModule } from '@appshore/platform/infrastructure/sms/sms.module';
import { QueueModule } from './platform-glue/queue/queue.module';
import { NotificationsQueueModule } from './platform-glue/queue/dispatchers/notifications-queue.module';
import { BulkOpsQueueModule } from './platform-glue/queue/dispatchers/bulk-ops-queue.module';
import { DataRetentionModule } from './platform-glue/queue/data-retention.module';
import { HealthModule } from '@appshore/platform/health/health.module';
import { EventBusModule } from './platform-glue/events/event-bus.module';
import { OutboundWebhooksModule } from './platform-glue/webhooks/outbound-webhooks.module';
import { DevModule } from './dev/dev.module';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';
import { EventContextInterceptor } from '@appshore/kernel/infrastructure/events/event-context.interceptor';
import { PromptingModule } from './domains/prompting/prompting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL?.toLowerCase() ?? 'info',
        transport: buildPinoTransport(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-session-token"]',
            '*.password',
            '*.token',
            '*.accessToken',
            '*.refreshToken',
            '*.email',
            '*.phone',
            '*.phoneNumber',
            '*.pin',
            '*.apiKey',
            '*.key',
            '*.secret',
          ],
          censor: '[REDACTED]',
        },
        mixin() {
          const ctx = requestContextStorage.getStore();
          const traceCtx = getActiveTraceContext();
          // Omit undefined/empty fields to avoid polluting log cardinality
          // (e.g. SUPER_ADMIN sessions have no tenantId, logs outside a
          // request/job have no traceId).
          const fields: Record<string, string> = {};
          if (ctx?.requestId) fields.requestId = ctx.requestId;
          if (ctx?.tenantId) fields.tenantId = ctx.tenantId;
          if (ctx?.userId) fields.userId = ctx.userId;
          if (ctx?.jobName) fields.jobName = ctx.jobName;
          if (ctx?.jobId) fields.jobId = ctx.jobId;
          if (traceCtx.traceId) fields.traceId = traceCtx.traceId;
          if (traceCtx.spanId) fields.spanId = traceCtx.spanId;
          return fields;
        },
        autoLogging: { ignore: shouldSkipRequestLog },
        serializers: {
          // Mask credential-bearing query params (e.g. the SSE ?token= access
          // token) so they never reach the log pipeline.
          req(req: any) {
            if (req?.url) req.url = maskUrlSecrets(req.url);
            return req;
          },
        },
        customSuccessMessage: (req: any, res: any) => `${req.method} ${maskUrlSecrets(req.url)} ${res.statusCode}`,
        customErrorMessage: (req: any, res: any, err: any) =>
          `${req.method} ${maskUrlSecrets(req.url)} ${res.statusCode} - ${err.message}`,
      },
    }),
    SharedModule,
    CacheModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    // ScheduleModule removed — all scheduling now uses BullMQ repeatable jobs
    PrismaModule,
    AuthModule,
    NotificationModule,
    SseModule,
    QueueModule,
    NotificationsQueueModule,
    BulkOpsQueueModule,
    PromptingModule,
    EventBusModule,
    HealthModule,
    PushModule,
    SmsModule,
    PlatformHooksModule,
    PlatformModule,
    IntegrationsModule,
    AiModule,
    AdminJobsModule,
    AdminEventsModule,
    AdminAiSpendModule,
    BillingModule,
    DeskModule,
    OutboundWebhooksModule,
    DataRetentionModule,
    ...(getEnvType() !== 'production' ? [DevModule] : []),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EventContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
