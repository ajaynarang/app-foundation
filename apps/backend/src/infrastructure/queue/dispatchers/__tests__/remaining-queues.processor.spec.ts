import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { GeoComputeQueueProcessor } from '../geo-compute-queue.processor';
import { NotificationsQueueProcessor } from '../notifications-queue.processor';
import { BulkOpsQueueProcessor } from '../bulk-ops-queue.processor';
import { FinanceQueueProcessor } from '../finance-queue.processor';
import { VendorDataQueueProcessor } from '../vendor-data-queue.processor';
import {
  GEO_COMPUTE_JOB_NAMES,
  NOTIFICATIONS_JOB_NAMES,
  BULK_OPS_JOB_NAMES,
  FINANCE_JOB_NAMES,
  VENDOR_DATA_JOB_NAMES,
} from '../../queue.constants';
import { DeadLetterService } from '../../dead-letter.service';

/**
 * Regression guard for the competing-consumer class of bug across the remaining
 * five shared queues. Each job name MUST route to the handler that owns it — no
 * cross-delivery, no silent null-completion.
 */
const mockDeadLetter = {
  recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
} as unknown as DeadLetterService;

function silence(d: object) {
  jest.spyOn((d as { logger: Logger }).logger, 'warn').mockImplementation();
}

afterEach(() => jest.clearAllMocks());

describe('GeoComputeQueueProcessor', () => {
  const progress = {
    jobNames: [GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS, 'update-progress'],
    run: jest.fn().mockResolvedValue('p'),
  };
  const mileage = { jobNames: [GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC], run: jest.fn().mockResolvedValue('m') };
  const d = new GeoComputeQueueProcessor([progress, mileage], mockDeadLetter);
  silence(d);

  it('routes route-progress to the progress handler', async () => {
    await d.process({ name: GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS } as Job);
    expect(progress.run).toHaveBeenCalledTimes(1);
    expect(mileage.run).not.toHaveBeenCalled();
  });
  it('routes load-mileage-recalc to the mileage handler', async () => {
    await d.process({ name: GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC } as Job);
    expect(mileage.run).toHaveBeenCalledTimes(1);
    expect(progress.run).not.toHaveBeenCalled();
  });
});

describe('NotificationsQueueProcessor', () => {
  const alerts = { jobNames: [NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST], run: jest.fn().mockResolvedValue('a') };
  const jobs = { jobNames: [NOTIFICATIONS_JOB_NAMES.CLEANUP], run: jest.fn().mockResolvedValue('c') };
  const d = new NotificationsQueueProcessor([alerts, jobs], mockDeadLetter);
  silence(d);

  it('routes alert-digest to the alerts handler', async () => {
    await d.process({ name: NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST } as Job);
    expect(alerts.run).toHaveBeenCalledTimes(1);
    expect(jobs.run).not.toHaveBeenCalled();
  });
  it('routes cleanup to the jobs handler', async () => {
    await d.process({ name: NOTIFICATIONS_JOB_NAMES.CLEANUP } as Job);
    expect(jobs.run).toHaveBeenCalledTimes(1);
    expect(alerts.run).not.toHaveBeenCalled();
  });
});

describe('BulkOpsQueueProcessor', () => {
  const retention = { jobNames: [BULK_OPS_JOB_NAMES.DATA_RETENTION], run: jest.fn().mockResolvedValue('r') };
  const docs = { jobNames: [BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP], run: jest.fn().mockResolvedValue('u') };
  const login = { jobNames: [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP], run: jest.fn().mockResolvedValue('l') };
  const d = new BulkOpsQueueProcessor([retention, docs, login], mockDeadLetter);
  silence(d);

  it('routes uploads-cleanup to the documents handler (not retention/login)', async () => {
    await d.process({ name: BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP } as Job);
    expect(docs.run).toHaveBeenCalledTimes(1);
    expect(retention.run).not.toHaveBeenCalled();
    expect(login.run).not.toHaveBeenCalled();
  });
});

describe('FinanceQueueProcessor', () => {
  const accounting = { jobNames: [FINANCE_JOB_NAMES.INVOICE], run: jest.fn().mockResolvedValue('i') };
  const trial = { jobNames: [FINANCE_JOB_NAMES.TRIAL_EXPIRY], run: jest.fn().mockResolvedValue('t') };
  const addon = { jobNames: [FINANCE_JOB_NAMES.ADDON_USAGE_RESET], run: jest.fn().mockResolvedValue('a') };
  const d = new FinanceQueueProcessor([accounting, trial, addon], mockDeadLetter);
  silence(d);

  it('routes invoice to accounting (not the cron handlers)', async () => {
    await d.process({ name: FINANCE_JOB_NAMES.INVOICE } as Job);
    expect(accounting.run).toHaveBeenCalledTimes(1);
    expect(trial.run).not.toHaveBeenCalled();
    expect(addon.run).not.toHaveBeenCalled();
  });
  it('routes trial-expiry to the trial handler', async () => {
    await d.process({ name: FINANCE_JOB_NAMES.TRIAL_EXPIRY } as Job);
    expect(trial.run).toHaveBeenCalledTimes(1);
    expect(accounting.run).not.toHaveBeenCalled();
  });
});

describe('VendorDataQueueProcessor', () => {
  const tms = { jobNames: [VENDOR_DATA_JOB_NAMES.TMS_DRIVERS], run: jest.fn().mockResolvedValue('tms') };
  const oauth = { jobNames: [VENDOR_DATA_JOB_NAMES.OAUTH_REFRESH], run: jest.fn().mockResolvedValue('o') };
  const lanes = { jobNames: [VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION], run: jest.fn().mockResolvedValue('ln') };
  const d = new VendorDataQueueProcessor([tms, oauth, lanes], mockDeadLetter);
  silence(d);

  it('routes tms-drivers to the TMS handler (never oauth/lanes)', async () => {
    await d.process({ name: VENDOR_DATA_JOB_NAMES.TMS_DRIVERS } as Job);
    expect(tms.run).toHaveBeenCalledTimes(1);
    expect(oauth.run).not.toHaveBeenCalled();
    expect(lanes.run).not.toHaveBeenCalled();
  });
  it('routes oauth-refresh to the oauth handler', async () => {
    await d.process({ name: VENDOR_DATA_JOB_NAMES.OAUTH_REFRESH } as Job);
    expect(oauth.run).toHaveBeenCalledTimes(1);
    expect(tms.run).not.toHaveBeenCalled();
  });
});
