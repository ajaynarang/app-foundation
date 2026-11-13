#!/usr/bin/env node
// Static checks for the Grafana-as-code catalog. Exit 1 on any problem. Never talks to Grafana.
//
//   node infra/observability/grafana-cloud/scripts/validate.mjs
//       structure, runbooks, label hygiene, names checked against the code
//   … --loki http://localhost:3100        also parse every LogQL query against a real Loki (the local stack)
//   … --promtool-file /tmp/promql.yaml    also write every PromQL query as a rules file for `promtool check rules`
//
// What it holds (docs/standards/observability.md, rules 5, 8, 9 and 11):
//   - the generated files match the catalog (the same check as generate.mjs --check);
//   - every rule has a sev1|sev2 severity, an env label, a summary, a description and a runbook link whose file
//     exists under docs/runbooks/ and has a `## <anchor>` heading; every `##` heading there is some rule's anchor;
//   - rules ship live; staging and production carry the same rules;
//   - every query filters on its environment and on this product's service; groups only by reviewed labels;
//     names no personal-data field; matches only `level` values pino-loki emits;
//   - every Logger context a query names is a real `new Logger(X.name)` in the code, and every `app_*` metric is one
//     metrics.ts creates; ops gauges (reported by every API task when there is no worker) aggregate with max, never sum;
//   - only the worker service-gone rule selects on the worker.
//
// The checks read the catalog's own output, not a re-parse of the YAML: the first check proves the two are equal.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RULE_AREAS } from '../catalog/alert-rules.mjs';
import { buildRuleFiles } from '../catalog/build-alerting.mjs';
import { ENVS, HAS_WORKER, RUNBOOK_BASE, RUNBOOK_DIR, SERVICE } from '../catalog/constants.mjs';
import { DASHBOARDS } from '../catalog/dashboards/index.mjs';
import { ROOT, outputs, staleFiles } from './generate.mjs';
import { isMain } from './lib/is-main.mjs';

export const REPO_ROOT = join(ROOT, '../../..');

/** Labels a query may group by or join on. Ids, not personal data; each is a closed set or a tenant id. */
export const ALLOWED_GROUP_LABELS = new Set([
  'jobName',
  'job_name',
  'queue',
  'tenantId',
  'tenant',
  'context',
  'channel',
  'reason',
  'surface',
  'status',
  'le',
  'http_route',
]);
const FORBIDDEN_WORDS = /\b(phone|email|token|password|otp|amount|userId|requestId|jobId)\b/i;
const ALLOWED_PLACEHOLDERS =
  /\$\{(GRAFANA_LOKI_UID|GRAFANA_PROM_UID|GRAFANA_CLOUDWATCH_UID|IRM_ONCALL_WEBHOOK_URL|IRM_NOTIFY_WEBHOOK_URL)\}/g;
/** pino-loki's level label values. Anything else, "warn" above all, silently matches nothing. */
const LOKI_LEVEL_VALUES = new Set([
  '10',
  '20',
  '30',
  '40',
  '50',
  '60',
  'debug',
  'info',
  'warning',
  'error',
  'critical',
]);
/** Gauges every reporting task reports alike: summing them over tasks double-counts. */
const OPS_GAUGES =
  /\bapp_(queue_[a-z_]+|cron_expected_interval_seconds|outbox_oldest_unpublished_seconds|deadline_oldest_due_seconds)\b/;
/** The one rule allowed to select on the worker; it exists only while HAS_WORKER is true. */
export const WORKER_RULE_KEY = 'ecs-service-gone-worker';
const WORKER_SELECTOR = /ecs-service-worker|\brole\s*=~?\s*\\?"worker/;

/**
 * A Loki rule scans its whole window on every evaluation and hosted Loki bills queried volume, so a long window must
 * evaluate slowly.
 */
const LOKI_MIN_INTERVAL = [
  { windowSec: 24 * 3600, intervalSec: 3600 },
  { windowSec: 3 * 3600, intervalSec: 15 * 60 },
];
const durationSec = (d) => {
  const m = /^(\d+)([smh])$/.exec(d ?? '');
  return m ? Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]] : NaN;
};

/** GitHub's heading anchor. */
export const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');

/** The rule anchors of one runbook file: its `## ` headings. */
export const runbookAnchors = (text) =>
  text
    .split('\n')
    .filter((line) => /^## /.test(line))
    .map((line) => slug(line.slice(3)));

// ---- inputs from the repository ----------------------------------------------

const SOURCE_ROOTS = ['apps/backend/src', 'packages/appshore/kernel/src', 'packages/appshore/platform/src'];
const METRICS_FILE = 'packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts';

function* tsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) yield* tsFiles(abs);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) yield abs;
  }
}

/** Every `new Logger(X.name)` and `new Logger('X')` context in the code, or null when the code is not there. */
export function loggerContexts(repoRoot) {
  const roots = SOURCE_ROOTS.map((r) => join(repoRoot, r)).filter(existsSync);
  if (roots.length === 0) return null;
  const names = new Set();
  for (const root of roots) {
    for (const file of tsFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/new Logger\(\s*([A-Za-z0-9_]+)\.name\s*[,)]/g)) names.add(m[1]);
      for (const m of text.matchAll(/new Logger\(\s*'([^']+)'\s*[,)]/g)) names.add(m[1]);
    }
  }
  return names;
}

/** Every Prometheus series name the foundation's instruments can export, or null when metrics.ts is not there. */
export function metricSeriesNames(repoRoot) {
  const file = join(repoRoot, METRICS_FILE);
  if (!existsSync(file)) return null;
  const names = new Set();
  for (const m of readFileSync(file, 'utf8').matchAll(/\.create[A-Za-z]+\(\s*'(app_[a-z0-9_]+)'/g)) {
    const base = m[1];
    const seconds = base.endsWith('_seconds') ? base : `${base}_seconds`;
    for (const n of [base, seconds])
      for (const suffix of ['', '_total', '_bucket', '_count', '_sum']) names.add(`${n}${suffix}`);
  }
  return names;
}

export function loadRunbooks(repoRoot) {
  const dir = join(repoRoot, RUNBOOK_DIR);
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => [f, readFileSync(join(dir, f), 'utf8')]),
  );
}

/** Every runbook link the catalog names, including rules HAS_WORKER leaves out (their anchors stay). */
export const catalogRunbookRefs = (areas = RULE_AREAS) =>
  new Set(
    areas
      .flatMap((area) => area.groups ?? [{ rules: area.rules ?? [] }])
      .flatMap((group) => group.rules)
      .map((rule) => rule.runbook),
  );

export function loadInputs(repoRoot = REPO_ROOT) {
  const texts = new Map(outputs());
  return {
    ruleFiles: buildRuleFiles().map(({ area, doc }) => {
      const file = `alerting/rules/${area}.yaml`;
      return { file, doc, text: texts.get(file) };
    }),
    dashboards: DASHBOARDS.map((dash) => ({ file: `dashboards/${dash.uid}.json`, dash })),
    runbooks: loadRunbooks(repoRoot),
    runbookRefs: catalogRunbookRefs(),
    contexts: loggerContexts(repoRoot),
    metrics: metricSeriesNames(repoRoot),
    envs: ENVS,
    hasWorker: HAS_WORKER,
  };
}

// ---- the checks ----------------------------------------------------------------

/**
 * @returns {{ problems: string[], logql: {where:string,expr:string}[], promql: {where:string,expr:string}[], counts: {rules:number,dashboards:number} }}
 */
export function validateCatalog(input) {
  const { ruleFiles, dashboards, runbooks, runbookRefs, contexts, metrics, envs } = input;
  const problems = [];
  const problem = (msg) => problems.push(msg);
  const logql = [];
  const promql = [];

  function checkQuery(expr, where, kind, envMatch) {
    for (const m of expr.matchAll(/\b(?:by|on|without)\s*\(([^)]*)\)/g)) {
      for (const label of m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (!ALLOWED_GROUP_LABELS.has(label)) problem(`${where}: groups by unreviewed label "${label}"`);
      }
    }
    if (FORBIDDEN_WORDS.test(expr)) problem(`${where}: query mentions a personal-data or secret field`);
    for (const m of expr.matchAll(/\blevel\s*(=~|!~|=|!=)\s*"([^"]*)"/g)) {
      for (const value of m[2].split('|')) {
        if (!LOKI_LEVEL_VALUES.has(value)) problem(`${where}: level value "${value}" is never emitted by pino-loki`);
      }
    }
    if (!expr.includes(`env="${envMatch}"`)) problem(`${where}: query does not filter env="${envMatch}"`);
    if (kind === 'loki' && !expr.includes(`service="${SERVICE}"`))
      problem(`${where}: query does not select service="${SERVICE}"`);
    if (kind === 'prom' && !expr.includes(`job="${SERVICE}"`))
      problem(`${where}: query does not select job="${SERVICE}"`);
    if (contexts) {
      for (const m of expr.matchAll(/\bcontext\s*(=~|=)\s*"([^"]*)"/g)) {
        for (const name of m[2].split('|')) {
          if (!/^[A-Za-z0-9_]+$/.test(name)) continue; // a pattern, not a name
          if (!contexts.has(name)) problem(`${where}: context "${name}" is no Logger in the code`);
        }
      }
    }
    if (kind === 'prom' && metrics) {
      for (const m of expr.matchAll(/\bapp_[a-z0-9_]+\b/g)) {
        if (!metrics.has(m[0])) problem(`${where}: metric ${m[0]} is not created in metrics.ts`);
      }
    }
    if (kind === 'prom' && OPS_GAUGES.test(expr) && /\bsum\b/.test(expr))
      problem(`${where}: an ops gauge is reported by every reporting task; aggregate it with max, never sum`);
  }

  // Dashboards reuse `$env` in AWS names, so the env label and the Terraform env must be the same word.
  for (const e of envs) {
    if (e.tfEnv !== e.name)
      problem(`constants.mjs: env "${e.name}" has tfEnv "${e.tfEnv}"; the boards need them equal`);
  }

  // ---- rules ----
  const uids = new Set();
  const keysByEnv = Object.fromEntries(envs.map((e) => [e.name, new Set()]));
  const anchorsUsed = new Set();
  let ruleCount = 0;
  for (const { file, doc, text } of ruleFiles) {
    const stray = (text ?? '').replace(ALLOWED_PLACEHOLDERS, '').match(/\$[{A-Za-z]/);
    if (stray) problem(`${file}: stray "$" (Grafana file provisioning would interpolate it): ${stray[0]}`);
    for (const group of doc.groups) {
      for (const rule of group.rules) {
        ruleCount += 1;
        const where = `${file}:${rule.uid}`;
        if (uids.has(rule.uid)) problem(`${where}: duplicate uid`);
        uids.add(rule.uid);
        if (rule.uid.length > 40) problem(`${where}: uid longer than 40 characters`);
        const { severity, env, signal: kind } = rule.labels ?? {};
        const envSpec = envs.find((e) => e.name === env);
        if (!['sev1', 'sev2'].includes(severity)) problem(`${where}: severity label must be sev1 or sev2`);
        if (!envSpec) problem(`${where}: env label must be one of ${envs.map((e) => e.name).join(', ')}`);
        const key =
          envSpec && rule.uid.startsWith(`${envSpec.short}-`) ? rule.uid.slice(envSpec.short.length + 1) : rule.uid;
        if (envSpec) keysByEnv[env].add(key);
        if (rule.isPaused) problem(`${where}: rules ship live, not paused`);
        for (const a of ['summary', 'description', 'runbook_url']) {
          if (!rule.annotations?.[a]) problem(`${where}: missing annotation ${a}`);
        }
        const url = rule.annotations?.runbook_url;
        if (url && !url.startsWith(`${RUNBOOK_BASE}/`))
          problem(`${where}: runbook_url must start with ${RUNBOOK_BASE}/`);
        else if (url) {
          const [rbFile, anchor] = url.slice(RUNBOOK_BASE.length + 1).split('#');
          if (!(rbFile in runbooks)) problem(`${where}: runbook ${RUNBOOK_DIR}/${rbFile} does not exist`);
          else if (!anchor) problem(`${where}: runbook link has no #anchor`);
          else if (!runbookAnchors(runbooks[rbFile]).includes(anchor))
            problem(`${where}: runbook ${rbFile} has no "## " heading for #${anchor}`);
          if (anchor) anchorsUsed.add(`${rbFile}#${anchor}`);
        }
        const query = rule.data.find((d) => d.refId === 'A');
        const serialized = JSON.stringify(rule.data);
        if (key !== WORKER_RULE_KEY && WORKER_SELECTOR.test(serialized))
          problem(`${where}: only ${WORKER_RULE_KEY} may select on the worker (the worker task is optional)`);
        if (kind === 'loki') {
          const window = query.relativeTimeRange?.from ?? 0;
          const interval = durationSec(group.interval);
          const tier = LOKI_MIN_INTERVAL.find((t) => window >= t.windowSec);
          if (Number.isNaN(interval)) problem(`${where}: group interval "${group.interval}" is not <n>s|m|h`);
          else if (tier && interval < tier.intervalSec)
            problem(
              `${where}: a ${window / 3600} h Loki window must evaluate every ${tier.intervalSec / 60} min or slower (group "${group.name}" runs every ${group.interval})`,
            );
        }
        if (kind === 'loki' || kind === 'prom') {
          checkQuery(query.model.expr, where, kind, env);
          (kind === 'loki' ? logql : promql).push({ where, expr: query.model.expr });
        } else if (kind === 'cloudwatch') {
          if (envSpec && !JSON.stringify(query.model.dimensions ?? {}).includes(envSpec.awsPrefix))
            problem(`${where}: CloudWatch dimensions do not name ${envSpec.awsPrefix}`);
        } else {
          problem(`${where}: signal label must be loki, prom or cloudwatch`);
        }
      }
    }
  }
  const [first, ...rest] = Object.entries(keysByEnv);
  for (const [env, keys] of rest) {
    const diff = [...first[1]].filter((k) => !keys.has(k)).concat([...keys].filter((k) => !first[1].has(k)));
    if (diff.length) problem(`rule parity: ${first[0]} and ${env} differ on ${diff.join(', ')}`);
  }

  // ---- runbooks: no anchor without a rule ----
  for (const ref of runbookRefs) anchorsUsed.add(ref);
  for (const [rbFile, text] of Object.entries(runbooks)) {
    for (const anchor of runbookAnchors(text)) {
      if (!anchorsUsed.has(`${rbFile}#${anchor}`))
        problem(`${RUNBOOK_DIR}/${rbFile}: "## " heading #${anchor} is no rule's runbook anchor`);
    }
  }

  // ---- dashboards ----
  const DASH_VARS = {
    $env: envs[0].name,
    $tenant: 'tenant-check',
    $__auto: '5m',
    $__range: '1h',
    $__rate_interval: '5m',
  };
  const fillVars = (expr) => expr.replace(/\$(__auto|__range|__rate_interval|env|tenant)\b/g, (m) => DASH_VARS[m]);
  const dashUids = new Set();
  for (const { file, dash } of dashboards) {
    if (dashUids.has(dash.uid)) problem(`${file}: duplicate dashboard uid`);
    dashUids.add(dash.uid);
    if (dash.uid.length > 40) problem(`${file}: uid longer than 40 characters`);
    if (!dash.templating.list.some((v) => v.name === 'env')) problem(`${file}: no env variable`);
    for (const panel of dash.panels.filter((p) => p.type !== 'row')) {
      const where = `${file}:"${panel.title}"`;
      if (!/^\$\{(loki|prom|cloudwatch)\}$/.test(panel.datasource?.uid ?? ''))
        problem(`${where}: datasource must be a dashboard variable`);
      for (const target of panel.targets) {
        if (target.datasource.type === 'cloudwatch') {
          if (!JSON.stringify(target.dimensions).includes('$env'))
            problem(`${where}: CloudWatch dimensions ignore $env`);
          if (WORKER_SELECTOR.test(JSON.stringify(target.dimensions)) && input.hasWorker === false)
            problem(`${where}: selects the worker service, but HAS_WORKER is false`);
          continue;
        }
        const kind = target.datasource.type === 'loki' ? 'loki' : 'prom';
        checkQuery(target.expr, where, kind, '$env');
        (kind === 'loki' ? logql : promql).push({ where, expr: fillVars(target.expr) });
      }
    }
  }

  return { problems, logql, promql, counts: { rules: ruleCount, dashboards: dashUids.size } };
}

// ---- CLI ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

  const stale = staleFiles();
  const { problems, logql, promql, counts } = validateCatalog(loadInputs());
  if (stale.length) problems.unshift(`stale generated files (run generate.mjs): ${stale.join(', ')}`);

  const lokiUrl = argValue('--loki');
  if (lokiUrl) {
    let parsed = 0;
    for (const { where, expr } of logql) {
      const isMetric = !expr.trim().startsWith('{');
      const endpoint = isMetric ? 'query' : 'query_range';
      const res = await fetch(`${lokiUrl}/loki/api/v1/${endpoint}?query=${encodeURIComponent(expr)}&limit=1`);
      if (res.status === 400) problems.push(`${where}: Loki rejected the query: ${(await res.text()).trim()}`);
      else if (!res.ok) problems.push(`${where}: Loki returned ${res.status}`);
      else parsed += 1;
    }
    console.log(`LogQL: ${parsed}/${logql.length} queries accepted by ${lokiUrl}`);
  }

  const promtoolFile = argValue('--promtool-file');
  if (promtoolFile) {
    const { toYaml } = await import('./lib/yaml-emit.mjs');
    const rules = promql.map(({ expr }, i) => ({ record: `catalog_check_${i}`, expr }));
    writeFileSync(promtoolFile, toYaml({ groups: [{ name: 'catalog-check', rules }] }));
    console.log(`PromQL: wrote ${rules.length} queries to ${promtoolFile}`);
  }

  console.log(
    `Checked ${counts.rules} rules, ${counts.dashboards} dashboards, ${logql.length} LogQL and ${promql.length} PromQL queries.`,
  );
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('OK');
}

if (isMain(import.meta.url)) await main();
