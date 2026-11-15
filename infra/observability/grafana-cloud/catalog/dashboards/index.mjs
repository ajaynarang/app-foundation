import overview from './overview.mjs';
import queuesJobs from './queues-jobs.mjs';
import slo from './slo.mjs';
import tenantHealth from './tenant-health.mjs';

export const DASHBOARDS = [overview, queuesJobs, slo, tenantHealth];
