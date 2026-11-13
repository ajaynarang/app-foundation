import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { edgeThrottlerOptions } from './bootstrap/edge-throttle';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from '@appshore/platform/shared/filters/http-exception.filter';
import configuration from './config/configuration';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AuthModule } from '@appshore/platform/auth/auth.module';
import { JwtAuthGuard } from '@appshore/platform/auth/guards/jwt-auth.guard';
import { TenantGuard } from '@appshore/platform/auth/guards/tenant.guard';
import { RolesGuard } from '@appshore/platform/auth/guards/roles.guard';
import { RequestContextMiddleware } from '@appshore/kernel/infrastructure/logging/request-context.middleware';
import { logContextMixin } from '@appshore/kernel/infrastructure/logging/log-context-mixin';
import { PlanGuard } from '@appshore/platform/auth/guards/plan.guard';
import { shouldSkipRequestLog } from '@appshore/kernel/infrastructure/logging/log-filter';
import { serializeErrorForLog, serializeRequestForLog } from '@appshore/kernel/infrastructure/logging/log-serializers';
import { scrubContactDetails, stripQueryString } from '@appshore/kernel/shared/utils/log-redaction';
import { buildPinoTransport } from '@appshore/kernel/infrastructure/logging/pino-transport';

// Domain Modules
import { PlatformModule } from './platform-glue/platform.module';
import { PlatformHooksModule } from './platform-glue/hooks.module';
import { IntegrationsModule } from './domains/integrations/integrations.module';
import { AiModule } from './domains/ai/ai.module';
import { AdminModule } from './domains/admin/admin.module';
import { BillingModule } from './domains/billing/billing.module';
import { SupportModule } from './domains/support/support.module';
import { OPTIONAL_FEATURES } from './platform-glue/features';
import { FeedbackModule } from './domains/feedback/feedback.module';
import { InAppNotificationsModule } from './domains/notifications/notifications.module';

// Infrastructure Modules
import { CacheModule } from './platform-glue/cache/cache.module';
import { SharedModule } from './shared/shared.module';
import { NotificationModule } from '@appshore/platform/infrastructure/notification/notification.module';
import { SseModule } from './platform-glue/sse/sse.module';
import { SmsModule } from '@appshore/platform/infrastructure/sms/sms.module';
import { QueueModule } from './platform-glue/queue/queue.module';
import { NotificationsQueueModule } from './platform-glue/queue/dispatchers/notifications-queue.module';
import { BulkOpsQueueModule } from './platform-glue/queue/dispatchers/bulk-ops-queue.module';
import { DataRetentionModule } from './platform-glue/queue/data-retention.module';
import { HealthModule } from '@appshore/platform/health/health.module';
import { EventBusModule } from './platform-glue/events/event-bus.module';
import { OutboundWebhooksModule } from './platform-glue/webhooks/outbound-webhooks.module';
import { SearchModule } from './platform-glue/search/search.module';
import { DevModule } from './dev/dev.module';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';
import { EventContextInterceptor } from '@appshore/kernel/infrastructure/events/event-context.interceptor';
import { IdempotencyInterceptor } from '@appshore/platform/infrastructure/idempotency/idempotency.interceptor';
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
        mixin: logContextMixin,
        autoLogging: { ignore: shouldSkipRequestLog },
        // The SSE stream authenticates with `?token=`, and invite and OAuth links carry secrets under other names:
        // the whole query string leaves `req`, and contact details a provider echoes leave `err`.
        serializers: { req: serializeRequestForLog, err: serializeErrorForLog },
        customSuccessMessage: (req: any, res: any) => `${req.method} ${stripQueryString(req.url)} ${res.statusCode}`,
        customErrorMessage: (req: any, res: any, err: any) =>
          `${req.method} ${stripQueryString(req.url)} ${res.statusCode} - ${scrubContactDetails(String(err?.message ?? ''))}`,
      },
    }),
    SharedModule,
    CacheModule,
    // Edge rate limit, per principal, counted in Redis: see bootstrap/edge-throttle.ts.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, AppCacheService],
      useFactory: edgeThrottlerOptions,
    }),
    // ScheduleModule removed — all scheduling now uses BullMQ repeatable jobs
    PrismaModule,
    AuthModule,
    NotificationModule,
    // NotificationModule sends the templated tenant-lifecycle emails; InAppNotificationsModule is the app's
    // inbox + triggers over the platform pipeline (PlatformNotificationsModule); NotificationsQueueModule is queue glue.
    InAppNotificationsModule,
    SseModule,
    QueueModule,
    NotificationsQueueModule,
    BulkOpsQueueModule,
    PromptingModule,
    EventBusModule,
    HealthModule,
    SmsModule,
    PlatformHooksModule,
    PlatformModule,
    IntegrationsModule,
    AiModule,
    AdminModule,
    BillingModule,
    SupportModule,
    // The optional features this product kept at scaffold time (platform-glue/features).
    ...OPTIONAL_FEATURES.flatMap((f) => f.modules),
    FeedbackModule,
    OutboundWebhooksModule,
    SearchModule,
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
    // Idempotency-Key on every authenticated create (ADR "API contract", section 5): interceptors run after the
    // guards, so the tenant and user are known.
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
