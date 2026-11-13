// node --test infra/observability/grafana-cloud/   (part of `pnpm check:ops`)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildRuleFiles } from '../catalog/build-alerting.mjs';
import { ENVS, PROJECT, REPO_URL_PLACEHOLDER, RUNBOOK_BASE, SERVICE } from '../catalog/constants.mjs';
import { DASHBOARDS } from '../catalog/dashboards/index.mjs';
import { outputs, staleFiles, writeAll } from './generate.mjs';
import { parseArgs, preflight, substitute, substitutionsFrom } from './grafana-apply.mjs';
import { toYaml } from './lib/yaml-emit.mjs';
import { catalogRunbookRefs, loadInputs, metricSeriesNames, validateCatalog, REPO_ROOT } from './validate.mjs';

// ---- yaml-emit ------------------------------------------------------------------

test('yaml-emit quotes every string a YAML reader would take as another type or another text', () => {
  const text = toYaml({
    plain: 'irm-notify',
    words: 'Per tenant health',
    keyword: 'yes',
    nullish: 'null',
    number: '30s',
    numeric: '1.5',
    colon: 'a: b',
    comment: 'x #y',
    dollar: '${GRAFANA_LOKI_UID}',
    empty: '',
    dash: '-',
  });
  assert.equal(
    text,
    [
      'plain: irm-notify',
      'words: Per tenant health',
      'keyword: "yes"',
      'nullish: "null"',
      'number: "30s"',
      'numeric: "1.5"',
      'colon: "a: b"',
      'comment: "x #y"',
      'dollar: "${GRAFANA_LOKI_UID}"',
      'empty: ""',
      'dash: "-"',
      '',
    ].join('\n'),
  );
});

test('yaml-emit writes multi-line strings as literal blocks that keep their trailing newlines', () => {
  assert.equal(toYaml({ a: 'x\ny' }), 'a: |-\n  x\n  y\n');
  assert.equal(toYaml({ a: 'x\ny\n' }), 'a: |\n  x\n  y\n');
  assert.equal(toYaml({ a: 'x\n\ny\n\n' }), 'a: |+\n  x\n\n  y\n\n');
  // A leading space cannot open a literal block without an indentation indicator: quoted instead.
  assert.equal(toYaml({ a: ' x\ny' }), 'a: " x\\ny"\n');
});

test('yaml-emit nests arrays and objects, and writes empty ones inline', () => {
  assert.equal(
    toYaml({ m: [['env', '=', 'production']], o: [{ k: 1, l: [true, null] }], e: {}, f: [] }),
    'm:\n  - - env\n    - "="\n    - production\no:\n  - k: 1\n    l:\n      - true\n      - null\ne: {}\nf: []\n',
  );
});

// ---- generate --------------------------------------------------------------------

test('the committed generated files match the catalog', () => {
  assert.deepEqual(staleFiles(), []);
});

test('generate --check reports a missing, an edited and an orphaned file, and writing clears all three', () => {
  const root = mkdtempSync(join(tmpdir(), 'grafana-gen-'));
  try {
    const all = outputs().map(([rel]) => rel);
    assert.deepEqual(staleFiles(root).sort(), [...all].sort(), 'an empty folder: every file is missing');

    writeAll(root, () => {});
    assert.deepEqual(staleFiles(root), []);

    const [firstDash] = all.filter((rel) => rel.startsWith('dashboards/'));
    writeFileSync(join(root, firstDash), '{}\n');
    mkdirSync(join(root, 'alerting/rules'), { recursive: true });
    writeFileSync(join(root, 'alerting/rules/removed-area.yaml'), 'apiVersion: 1\n');
    assert.deepEqual(staleFiles(root).sort(), ['alerting/rules/removed-area.yaml', firstDash].sort());

    writeAll(root, () => {});
    assert.deepEqual(staleFiles(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- validate ----------------------------------------------------------------------

test('the shipped catalog validates against this repository', () => {
  const { problems, counts } = validateCatalog(loadInputs());
  assert.deepEqual(problems, []);
  assert.equal(counts.dashboards, 4);
});

test('the four boards carry the product name and filter on its service', () => {
  assert.deepEqual(
    DASHBOARDS.map((d) => d.uid),
    ['overview', 'queues-jobs', 'slo', 'tenant-health'].map((b) => `${PROJECT}-${b}`),
  );
  for (const dash of DASHBOARDS) {
    for (const panel of dash.panels.filter((p) => p.type !== 'row')) {
      for (const t of panel.targets) {
        if (t.datasource.type === 'loki') assert.match(t.expr, new RegExp(`service="${SERVICE}"`));
        if (t.datasource.type === 'prometheus') assert.match(t.expr, new RegExp(`job="${SERVICE}"`));
      }
    }
  }
});

const HTTP_5XX = (env) =>
  `sum(count_over_time({service="${SERVICE}", env="${env}"} | json | context="HttpExceptionFilter" [5m]))`;

function rule(overrides = {}) {
  return {
    key: 'api-5xx-rate',
    title: 'API 5xx rate',
    severity: 'sev1',
    kind: 'loki',
    expr: HTTP_5XX,
    windowSec: 300,
    summary: 'API answers 5xx',
    description: 'More than zero 5xx lines.',
    runbook: 'api.md#api-5xx-rate',
    ...overrides,
  };
}

const RUNBOOK = '# API\n\n## api-5xx-rate\n\n### What it means\n';

function check(rules, { runbooks = { 'api.md': RUNBOOK }, mutate, hasWorker = true } = {}) {
  const areas = [{ area: 'api', interval: '1m', rules }];
  const ruleFiles = buildRuleFiles(areas, { hasWorker }).map(({ area, doc }) => {
    if (mutate) mutate(doc);
    return { file: `alerting/rules/${area}.yaml`, doc, text: toYaml(doc) };
  });
  const real = loadInputs();
  return validateCatalog({
    ...real,
    ruleFiles,
    dashboards: [],
    runbooks,
    runbookRefs: catalogRunbookRefs(areas),
  }).problems;
}

test('a well-formed rule with its runbook anchor passes', () => {
  assert.deepEqual(check([rule()]), []);
});

test('a rule whose runbook file is missing, or has no anchor heading, fails', () => {
  assert.match(check([rule()], { runbooks: {} }).join('\n'), /runbook docs\/runbooks\/api\.md does not exist/);
  assert.match(
    check([rule()], { runbooks: { 'api.md': '# API\n\n## something-else\n' } }).join('\n'),
    /has no "## " heading for #api-5xx-rate/,
  );
  assert.match(check([rule({ runbook: 'api.md' })]).join('\n'), /runbook link has no #anchor/);
});

test('a runbook heading that is no rule anchor fails', () => {
  const problems = check([rule()], { runbooks: { 'api.md': `${RUNBOOK}\n## orphan-rule\n` } });
  assert.deepEqual(problems, ['docs/runbooks/api.md: "## " heading #orphan-rule is no rule\'s runbook anchor']);
});

test('a rule with no severity, or an unknown one, fails', () => {
  assert.match(check([rule({ severity: undefined })]).join('\n'), /severity label must be sev1 or sev2/);
  assert.match(check([rule({ severity: 'critical' })]).join('\n'), /severity label must be sev1 or sev2/);
});

test('a query that groups by an unreviewed label, names personal data or a level pino-loki never writes fails', () => {
  const by = (label) => (env) => `sum by (${label}) (count_over_time({service="${SERVICE}", env="${env}"} [5m]))`;
  assert.match(check([rule({ expr: by('hostname') })]).join('\n'), /unreviewed label "hostname"/);
  assert.match(check([rule({ expr: by('userId') })]).join('\n'), /personal-data or secret field/);
  const warn = (env) => `count_over_time({service="${SERVICE}", env="${env}"} | level="warn" [5m])`;
  assert.match(check([rule({ expr: warn })]).join('\n'), /level value "warn" is never emitted/);
});

test('a query that does not filter its environment or its service fails', () => {
  const noEnv = () => `count_over_time({service="${SERVICE}"} [5m])`;
  assert.match(check([rule({ expr: noEnv })]).join('\n'), /does not filter env="production"/);
  const otherService = (env) => `count_over_time({service="other-backend", env="${env}"} [5m])`;
  assert.match(check([rule({ expr: otherService })]).join('\n'), new RegExp(`does not select service="${SERVICE}"`));
});

test('a Logger context or a metric the code does not have fails', () => {
  const ctx = (env) => `count_over_time({service="${SERVICE}", env="${env}"} | json | context="NoSuchService" [5m])`;
  assert.match(check([rule({ expr: ctx })]).join('\n'), /context "NoSuchService" is no Logger in the code/);
  const metric = (env) => `sum(rate(app_made_up_total{job="${SERVICE}", env="${env}"}[5m]))`;
  assert.match(check([rule({ kind: 'prom', expr: metric })]).join('\n'), /app_made_up_total is not created/);
});

test('summing an ops gauge fails; max passes', () => {
  const g = (agg) => (env) => `${agg}(app_outbox_oldest_unpublished_seconds{job="${SERVICE}", env="${env}"}) > 900`;
  assert.match(check([rule({ kind: 'prom', expr: g('sum') })]).join('\n'), /aggregate it with max, never sum/);
  assert.deepEqual(check([rule({ kind: 'prom', expr: g('max') })]), []);
});

test('only the worker service-gone rule may select on the worker, and it is left out with no worker', () => {
  const cloudwatch = (key, role) =>
    rule({
      key,
      kind: 'cloudwatch',
      runbook: `api.md#${key}`,
      requiresWorker: role === 'worker',
      metric: (envSpec) => ({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        statistic: 'Average',
        dimensions: { ServiceName: `${envSpec.awsPrefix}-ecs-service-${role}` },
      }),
      reducer: 'last',
      op: 'lt',
      threshold: 0,
      noData: 'Alerting',
    });
  const runbooks = { 'api.md': '## ecs-service-gone-worker\n\n## ecs-service-gone-api\n\n## sneaky\n' };
  assert.deepEqual(
    check([cloudwatch('ecs-service-gone-worker', 'worker'), cloudwatch('ecs-service-gone-api', 'api')], {
      runbooks: { 'api.md': '## ecs-service-gone-worker\n\n## ecs-service-gone-api\n' },
    }),
    [],
  );
  assert.match(
    check([cloudwatch('sneaky', 'worker')], { runbooks }).join('\n'),
    /only ecs-service-gone-worker may select on the worker/,
  );
  // HAS_WORKER = false: the rule is not generated, and its runbook anchor still counts as a rule's.
  const areas = [{ area: 'infra', interval: '1m', rules: [cloudwatch('ecs-service-gone-worker', 'worker')] }];
  assert.deepEqual(buildRuleFiles(areas, { hasWorker: false }), []);
  assert.deepEqual(
    check([cloudwatch('ecs-service-gone-worker', 'worker')], {
      hasWorker: false,
      runbooks: { 'api.md': '## ecs-service-gone-worker\n' },
    }),
    [],
  );
});

test('a paused rule, a rule missing in one environment, or a stray "$" fails', () => {
  const paused = check([rule()], { mutate: (doc) => (doc.groups[0].rules[0].isPaused = true) });
  assert.match(paused.join('\n'), /rules ship live, not paused/);
  const parity = check([rule()], { mutate: (doc) => (doc.groups[1].rules = []) });
  assert.match(parity.join('\n'), /rule parity: production and staging differ on api-5xx-rate/);
  const stray = check([rule({ description: 'costs $HOME' })]);
  assert.match(stray.join('\n'), /stray "\$"/);
});

test('every runbook link starts at the repository runbook base', () => {
  const [{ doc }] = buildRuleFiles([{ area: 'api', interval: '1m', rules: [rule()] }]);
  assert.equal(doc.groups[0].rules[0].annotations.runbook_url, `${RUNBOOK_BASE}/api.md#api-5xx-rate`);
  assert.equal(doc.groups.length, ENVS.length);
});

test('the metric name list is read from metrics.ts with its Prometheus suffixes', () => {
  const names = metricSeriesNames(REPO_ROOT);
  for (const n of [
    'app_job_failed_total',
    'app_queue_waiting',
    'app_cron_expected_interval_seconds',
    'app_ai_invocation_duration_seconds_bucket',
    'app_ai_invocation_cost_usd_total',
  ]) {
    assert.ok(names.has(n), n);
  }
});

// ---- grafana-apply --------------------------------------------------------------------

const READY = {
  GRAFANA_URL: 'https://grafana.example.test',
  GRAFANA_SA_TOKEN: 'test-token',
  IRM_ONCALL_WEBHOOK_URL: 'https://irm.example.test/oncall',
};
const REAL_REPO = 'https://github.com/example/product';

test('a dry run needs nothing', () => {
  assert.deepEqual(preflight({ opts: parseArgs([]), env: {}, repoUrl: REPO_URL_PLACEHOLDER }), []);
});

test('--apply refuses while REPO_URL is the placeholder', () => {
  const errors = preflight({ opts: parseArgs(['--apply']), env: READY, repoUrl: REPO_URL_PLACEHOLDER });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /REPO_URL .* is still the placeholder/);
});

test('--apply refuses without the on-call webhook URL, or without the Grafana credentials', () => {
  const noOncall = preflight({
    opts: parseArgs(['--apply']),
    env: { ...READY, IRM_ONCALL_WEBHOOK_URL: '' },
    repoUrl: REAL_REPO,
  });
  assert.deepEqual(noOncall, ['--apply needs IRM_ONCALL_WEBHOOK_URL: without it a sev1 alert reaches nobody.']);
  const noToken = preflight({
    opts: parseArgs(['--apply']),
    env: { ...READY, GRAFANA_SA_TOKEN: '' },
    repoUrl: REAL_REPO,
  });
  assert.deepEqual(noToken, ['--apply needs GRAFANA_URL and GRAFANA_SA_TOKEN.']);
});

test('--apply refuses stale generated files, and an unknown section', () => {
  const stale = preflight({
    opts: parseArgs(['--apply']),
    env: READY,
    repoUrl: REAL_REPO,
    stale: ['dashboards/x.json'],
  });
  assert.match(stale.join('\n'), /Generated files are stale/);
  assert.match(preflight({ opts: parseArgs(['--only', 'nope']), env: {} }).join('\n'), /Unknown section\(s\): nope/);
  assert.deepEqual(preflight({ opts: parseArgs(['--apply']), env: READY, repoUrl: REAL_REPO }), []);
});

test('substitution replaces only the known placeholders, with the Grafana Cloud defaults', () => {
  const subs = substitutionsFrom({ IRM_ONCALL_WEBHOOK_URL: 'https://irm.example.test/a"b' });
  const out = substitute({ ds: '${GRAFANA_LOKI_UID}', url: '${IRM_ONCALL_WEBHOOK_URL}', q: '${other} $env' }, subs);
  assert.deepEqual(out, { ds: 'grafanacloud-logs', url: 'https://irm.example.test/a"b', q: '${other} $env' });
});

test('the README names every script it documents', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const s of ['generate.mjs', 'validate.mjs', 'grafana-apply.mjs', 'check:ops']) assert.ok(readme.includes(s), s);
});
