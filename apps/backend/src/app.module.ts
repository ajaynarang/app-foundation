import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import configuration from './config/configuration';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { RequestContextMiddleware, requestContextStorage } from './infrastructure/logging/request-context.middleware';
import { PlanGuard } from './auth/guards/plan.guard';
import { shouldSkipRequestLog, maskUrlSecrets } from './infrastructure/logging/log-filter';
import { getActiveTraceContext } from './infrastructure/logging/trace-context';
import { buildPinoTransport } from './infrastructure/logging/pino-transport';

// Domain Modules
import { PlatformModule } from './domains/platform/platform.module';
import { IntegrationsModule } from './domains/integrations/integrations.module';
import { AiModule } from './domains/ai/ai.module';
import { AdminJobsModule } from './domains/admin/admin-jobs.module';
import { AdminEventsModule } from './domains/admin/admin-events.module';
import { AdminAiSpendModule } from './domains/admin/admin-ai-spend.module';
import { BillingModule } from './domains/billing/billing.module';
import { DeskModule } from './domains/desk/desk.module';

// Infrastructure Modules
import { CacheModule } from './infrastructure/cache/cache.module';
import { SharedModule } from './shared/shared.module';
import { NotificationModule } from './infrastructure/notification/notification.module';
import { SseModule } from './infrastructure/sse/sse.module';
import { PushModule } from './infrastructure/push/push.module';
import { SmsModule } from './infrastructure/sms/sms.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { NotificationsQueueModule } from './infrastructure/queue/dispatchers/notifications-queue.module';
import { BulkOpsQueueModule } from './infrastructure/queue/dispatchers/bulk-ops-queue.module';
import { DataRetentionModule } from './infrastructure/queue/data-retention.module';
import { HealthModule } from './health/health.module';
import { EventBusModule } from './infrastructure/events/event-bus.module';
import { OutboundWebhooksModule } from './infrastructure/outbound-webhooks/outbound-webhooks.module';
import { DevModule } from './dev/dev.module';
import { getEnvType } from './shared/utils/env-type';
import { EventContextInterceptor } from './infrastructure/events/event-context.interceptor';
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
