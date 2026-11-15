// Shared constants for the Grafana-as-code catalog.
// Everything under alerting/ and dashboards/ is GENERATED from catalog/ by scripts/generate.mjs. Edit the catalog,
// regenerate, commit both.
//
// Every product-specific name derives from the first three constants. `pnpm init-app` sets PROJECT and REPO_URL and
// regenerates; a product with no worker task sets HAS_WORKER to false by hand (docs/observability.md, level 2).

/** The product slug: the same value as the Terraform `project` variable. AWS names are `<PROJECT>-<env>-…`. */
export const PROJECT = 'app';

/** The product's repository, for runbook links. `grafana-apply.mjs --apply` refuses to run while it is the placeholder. */
export const REPO_URL = 'https://github.com/your-org/your-repo';
export const REPO_URL_PLACEHOLDER = 'https://github.com/your-org/your-repo';

/**
 * False when the product runs no worker task (Terraform `worker_desired_count = 0`). The API then consumes every queue
 * and reports the ops gauges, and nothing here may select on the worker service, because a service with no task sends
 * no metric at all.
 */
export const HAS_WORKER = true;

/** The `service` label on every log line and the `job` label on every metric (OTEL_SERVICE_NAME's default). */
export const SERVICE = `${PROJECT}-backend`;

/** The branch runbook links point at. */
export const RUNBOOK_BRANCH = 'main';
/** Repo-relative runbook directory, used by validate.mjs to prove each link resolves. */
export const RUNBOOK_DIR = 'docs/runbooks';
export const RUNBOOK_BASE = `${REPO_URL}/blob/${RUNBOOK_BRANCH}/${RUNBOOK_DIR}`;

/**
 * The two deployed environments. `name` is the `env` label (ENV_TYPE through env-label.ts, never NODE_ENV);
 * `tfEnv` is the Terraform `env` variable, which names every AWS resource.
 *
 * `rdsMaxConnections` is the database's `max_connections`, which RDS derives from the instance class
 * (about DBInstanceClassMemory / 9531392). 100 fits a 1 GiB class; set the real value for each environment's class.
 */
export const ENVS = [
  { name: 'production', short: 'prd', tfEnv: 'production', rdsMaxConnections: 100 },
  { name: 'staging', short: 'stg', tfEnv: 'staging', rdsMaxConnections: 100 },
].map((env) => ({ ...env, awsPrefix: `${PROJECT}-${env.tfEnv}` }));

/** The Terraform `aws_region` default. Change it with the variable. */
export const AWS_REGION = 'us-east-1';

/** Loki stream selector for one environment: the two labels code sets (rule 8). */
export const streamSelector = (env) => `{service="${SERVICE}", env="${env}"}`;

/** PromQL label matcher for one environment, with optional extra matchers. */
export const metricMatcher = (env, extra = '') => `job="${SERVICE}", env="${env}"${extra ? `, ${extra}` : ''}`;

/** AWS resource names, as Terraform writes them (`local.prefix` is `<project>-<env>`). */
export const awsNames = (prefix) => ({
  rds: `${prefix}-rds-postgres`,
  redis: `${prefix}-redis-001`,
  cluster: `${prefix}-ecs-cluster`,
  service: (role) => `${prefix}-ecs-service-${role}`,
});

/**
 * Datasource UID placeholders. Grafana file provisioning expands `${VAR}` from its own environment;
 * scripts/grafana-apply.mjs substitutes the same tokens (with the Grafana Cloud defaults) before calling the API.
 */
export const DS = {
  loki: '${GRAFANA_LOKI_UID}',
  prom: '${GRAFANA_PROM_UID}',
  cloudwatch: '${GRAFANA_CLOUDWATCH_UID}',
  expr: '__expr__',
};

export const DS_DEFAULTS = {
  GRAFANA_LOKI_UID: 'grafanacloud-logs',
  GRAFANA_PROM_UID: 'grafanacloud-prom',
  GRAFANA_CLOUDWATCH_UID: 'cloudwatch',
};

export const FOLDER = (env) => ({ uid: `${PROJECT}-alerts-${env}`, title: `${PROJECT} alerts · ${env}` });
export const DASHBOARD_FOLDER = { uid: `${PROJECT}-dashboards`, title: `${PROJECT} dashboards` };

/** Two Grafana IRM webhooks: `oncall` pages a human, `notify` only notifies. */
export const CONTACT_POINTS = {
  oncall: 'irm-oncall',
  notify: 'irm-notify',
};

/** The notification template name; its two parts are `<name>.title` and `<name>.message`. */
export const TEMPLATE_NAME = PROJECT;

/**
 * Log level matchers. pino-loki sets the `level` stream label from its levelMap: 40 -> "warning" (never "warn"),
 * 50 -> "error", 60 -> "critical". Loki regex matchers are fully anchored, so the value must match exactly; the
 * numeric alternatives cover lines shipped without the levelMap. validate.mjs rejects "warn".
 */
export const LEVEL = {
  error: 'level=~"50|60|error|critical"',
  warn: 'level=~"40|warning"',
  warnOrError: 'level=~"40|50|60|warning|error|critical"',
};
