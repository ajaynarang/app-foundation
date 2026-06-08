import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { NOTIFICATIONS_JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../infrastructure/queue/job-handler.contract';
import { EscalationService } from './alerts/services/escalation.service';
import { AutoResolutionService } from './alerts/services/auto-resolution.service';
import { AlertDigestService } from './alerts/services/alert-digest.service';

/**
 * Owns the alert-related cron sweeps on the `notifications` queue
 * (ALERT_ESCALATION, ALERT_UNSNOOZE, ALERT_DIGEST, SHIFT_SUMMARY). A plain
 * handler — the single NotificationsQueueProcessor dispatcher routes by name;
 * the sibling NotificationJobsHandler owns CLEANUP/DOCUMENT_EXPIRY/INVOICE_OVERDUE.
 */
@Injectable()
export class AlertNotificationsJobHandler implements QueueJobHandler {
  readonly jobNames = [
    NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION,
    NOTIFICATIONS_JOB_NAMES.ALERT_UNSNOOZE,
    NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST,
    NOTIFICATIONS_JOB_NAMES.SHIFT_SUMMARY,
  ];
  private readonly logger = new Logger(AlertNotificationsJobHandler.name);

  constructor(
    private readonly escalationService: EscalationService,
    private readonly autoResolutionService: AutoResolutionService,
    private readonly alertDigestService: AlertDigestService,
  ) {}

  async run(job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    switch (job.name) {
      case NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION:
        return this.escalationService.checkEscalations();

      case NOTIFICATIONS_JOB_NAMES.ALERT_UNSNOOZE:
        return this.autoResolutionService.unsnoozeExpired();

      case NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST:
        return this.alertDigestService.generateDailyDigest();

      case NOTIFICATIONS_JOB_NAMES.SHIFT_SUMMARY:
        return this.alertDigestService.generateShiftSummary();

      default:
        return;
    }
  }
}
