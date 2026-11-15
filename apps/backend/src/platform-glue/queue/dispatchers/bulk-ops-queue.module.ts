import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DataRetentionModule } from '../data-retention.module';
import { AuthModule } from '@appshore/platform/auth/auth.module';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DataRetentionJobHandler } from '@appshore/platform/infrastructure/queue/data-retention.processor';
import { LoginEventCleanupJobHandler } from '@appshore/platform/auth/login-event-cleanup.processor';
import { TokensCleanupJobHandler } from '@appshore/platform/auth/tokens-cleanup.processor';
import { PlansModule } from '@appshore/platform/domains/plans/plans.module';
import { TrialExpiryService } from '@appshore/platform/domains/plans/trial-expiry.service';
import { OpsHeartbeatJobHandler } from '@appshore/platform/infrastructure/queue/ops-heartbeat.job';
import { ScheduleManagerService } from '@appshore/platform/infrastructure/queue/schedule-manager.service';
import { FoundationSchedulesRegistrar } from '@appshore/platform/infrastructure/queue/foundation-schedules';
import { QueueMetricsReporter } from '@appshore/platform/infrastructure/queue/queue-metrics.reporter';
import { OutboxRelayJobHandler } from '@appshore/platform/infrastructure/events/outbox-relay.handler';
import { OutboxRelayModule } from '../../events/outbox/outbox-relay.module';
import { DeadlinesModule } from '@appshore/platform/infrastructure/deadlines/deadlines.module';
import { DeadlineSweeper } from '@appshore/platform/infrastructure/deadlines/deadline.sweeper';
import { AiConnectModule } from '../../../domains/ai/routing/connect/ai-connect.module';
import { AiCredentialRevalidationHandler } from '../../../domains/ai/routing/connect/ai-credential-revalidation.handler';
import { OAuthModule } from '../../../domains/integrations/oauth/oauth.module';
import { OAuthRefreshJobHandler } from '../../../domains/integrations/oauth/oauth-refresh.processor';
import { BulkOpsQueueProcessor } from './bulk-ops-queue.processor';

/**
 * Wires the single `bulk-ops` queue dispatcher. Imports the modules that export
 * the handler classes and assembles them into the queue's handler-array
 * token via an explicit factory. Register additional bulk-op handlers here;
 * `bulk-ops-handlers.spec.ts` fails when a BULK_OPS job name has no handler in the factory.
 *
 * It also owns the foundation crons' schedules (`FoundationSchedulesRegistrar` applies each
 * `job_schedules` row at boot), the ops heartbeat's repeatable, and the queue and cron-interval
 * gauges (`QueueMetricsReporter`, in the reporting process only).
 */
@Module({
  imports: [
    QueueModule,
    PrismaModule,
    forwardRef(() => DataRetentionModule),
    forwardRef(() => AuthModule),
    PlansModule,
    OutboxRelayModule,
    DeadlinesModule,
    AiConnectModule,
    OAuthModule,
  ],
  providers: [
    BulkOpsQueueProcessor,
    OpsHeartbeatJobHandler,
    ScheduleManagerService,
    FoundationSchedulesRegistrar,
    QueueMetricsReporter,
    {
      provide: jobHandlersToken(QUEUE_NAMES.BULK_OPS),
      useFactory: (
        retention: DataRetentionJobHandler,
        login: LoginEventCleanupJobHandler,
        tokens: TokensCleanupJobHandler,
        trialExpiry: TrialExpiryService,
        heartbeat: OpsHeartbeatJobHandler,
        outboxRelay: OutboxRelayJobHandler,
        deadlineSweep: DeadlineSweeper,
        aiCredentialRevalidation: AiCredentialRevalidationHandler,
        oauthRefresh: OAuthRefreshJobHandler,
      ): QueueJobHandler[] => [
        retention,
        login,
        tokens,
        trialExpiry,
        heartbeat,
        outboxRelay,
        deadlineSweep,
        aiCredentialRevalidation,
        oauthRefresh,
      ],
      inject: [
        DataRetentionJobHandler,
        LoginEventCleanupJobHandler,
        TokensCleanupJobHandler,
        TrialExpiryService,
        OpsHeartbeatJobHandler,
        OutboxRelayJobHandler,
        DeadlineSweeper,
        AiCredentialRevalidationHandler,
        OAuthRefreshJobHandler,
      ],
    },
  ],
})
export class BulkOpsQueueModule {}
