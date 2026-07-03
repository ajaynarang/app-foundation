import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshJwtStrategy } from './strategies/refresh-jwt.strategy';
import { FirebaseAuthService } from './firebase-auth.service';
import { PinService } from './pin.service';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { LoginEventService } from './login-event.service';
import { LoginEventCleanupJobHandler } from './login-event-cleanup.processor';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret') || 'default-secret',
        signOptions: {
          expiresIn: configService.get<string>('jwt.accessExpiry') || '15m',
        } as any,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    JwtStrategy,
    RefreshJwtStrategy,
    FirebaseAuthService,
    PinService,
    LoginEventService,
    LoginEventCleanupJobHandler,
  ],
  exports: [
    AuthService,
    JwtTokenService,
    FirebaseAuthService,
    PinService,
    LoginEventService,
    LoginEventCleanupJobHandler,
  ],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: {
          category: 'maintenance',
          jobType: BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP,
        },
      },
    });
    if (!schedule?.isEnabled) return;

    const existingJobs = await this.bulkOpsQueue.getRepeatableJobs();
    const repeatOpts =
      schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

    const alreadyScheduled = existingJobs.some(
      (job) =>
        job.name === BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP &&
        (schedule.scheduleType === 'cron' ? job.pattern === schedule.pattern : true),
    );

    if (!alreadyScheduled) {
      const envelope = buildJobEnvelope(
        {},
        {
          tenantId: 'system',
          source: 'cron',
        },
      );
      await this.bulkOpsQueue.add(BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP, envelope, {
        repeat: repeatOpts,
        jobId: `maintenance-${BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP}`,
        attempts: 1,
        removeOnFail: { age: 86400 },
      });
      this.logger.log('Login event cleanup cron job scheduled from DB config');
    }
  }
}
