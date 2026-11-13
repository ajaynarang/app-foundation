#!/usr/bin/env node
// Applies the catalog to a Grafana stack through its HTTP API. Idempotent: every call is an upsert.
// DRY RUN BY DEFAULT: without --apply it prints the plan and changes nothing.
//
//   node infra/observability/grafana-cloud/scripts/grafana-apply.mjs                    dry run
//   node infra/observability/grafana-cloud/scripts/grafana-apply.mjs --apply            apply everything
//   node infra/observability/grafana-cloud/scripts/grafana-apply.mjs --apply --only rules,dashboards
//   … --apply --editable         leave rules editable in the UI (the UI and the code can then drift)
//   … --apply --skip-env-check   apply rules even if Loki has not seen both env values in the last 24 h
//
// Env (apply-time secrets of the grafana-apply workflow; never app config, never Doppler):
//   GRAFANA_URL, GRAFANA_SA_TOKEN   required for --apply (a service account with the Editor or Admin role)
//   IRM_ONCALL_WEBHOOK_URL          required for --apply: the contact point that pages
//   IRM_NOTIFY_WEBHOOK_URL          optional; unset leaves the notify contact point as it is in Grafana
//   GRAFANA_LOKI_UID, GRAFANA_PROM_UID, GRAFANA_CLOUDWATCH_UID   datasource UIDs (default: the Grafana Cloud ones)
//
// --apply also refuses while REPO_URL in catalog/constants.mjs is the placeholder (every runbook link would be
// dead), and while a generated file is stale (what is applied must be what is committed).
//
// Sections, in apply order: folders, templates, contact-points, policies, rules, dashboards.

import { buildContactPoints, buildPolicies, buildRuleFiles, buildTemplates } from '../catalog/build-alerting.mjs';
import {
  CONTACT_POINTS,
  DASHBOARD_FOLDER,
  DS_DEFAULTS,
  ENVS,
  FOLDER,
  REPO_URL,
  REPO_URL_PLACEHOLDER,
} from '../catalog/constants.mjs';
import { DASHBOARDS } from '../catalog/dashboards/index.mjs';
import { staleFiles } from './generate.mjs';
import { isMain } from './lib/is-main.mjs';

export const SECTIONS = ['folders', 'templates', 'contact-points', 'policies', 'rules', 'dashboards'];

export function parseArgs(argv) {
  const onlyArg = argv.find((a) => a.startsWith('--only'));
  const onlyValue = onlyArg?.includes('=') ? onlyArg.split('=')[1] : onlyArg ? argv[argv.indexOf(onlyArg) + 1] : '';
  return {
    apply: argv.includes('--apply'),
    editable: argv.includes('--editable'),
    skipEnvCheck: argv.includes('--skip-env-check'),
    only: onlyValue ? onlyValue.split(',').map((s) => s.trim()) : SECTIONS,
  };
}

/** Every reason this run must not start. Pure, so the refusals are tested without a network. */
export function preflight({ opts, env, repoUrl = REPO_URL, stale = [] }) {
  const errors = [];
  const unknown = opts.only.filter((s) => !SECTIONS.includes(s));
  if (unknown.length) errors.push(`Unknown section(s): ${unknown.join(', ')}. Use: ${SECTIONS.join(', ')}`);
  if (!opts.apply) return errors;
  if (!env.GRAFANA_URL || !env.GRAFANA_SA_TOKEN) errors.push('--apply needs GRAFANA_URL and GRAFANA_SA_TOKEN.');
  if (!env.IRM_ONCALL_WEBHOOK_URL)
    errors.push('--apply needs IRM_ONCALL_WEBHOOK_URL: without it a sev1 alert reaches nobody.');
  if (repoUrl === REPO_URL_PLACEHOLDER)
    errors.push(
      `REPO_URL in catalog/constants.mjs is still the placeholder (${REPO_URL_PLACEHOLDER}); every runbook link would be dead. Set it (pnpm init-app does), regenerate, commit.`,
    );
  if (stale.length) errors.push(`Generated files are stale (run generate.mjs and commit): ${stale.join(', ')}`);
  return errors;
}

/** The datasource UIDs and webhook URLs that replace the `${VAR}` placeholders. */
export function substitutionsFrom(env) {
  return {
    ...Object.fromEntries(Object.entries(DS_DEFAULTS).map(([k, v]) => [k, env[k] || v])),
    IRM_ONCALL_WEBHOOK_URL: env.IRM_ONCALL_WEBHOOK_URL ?? '',
    IRM_NOTIFY_WEBHOOK_URL: env.IRM_NOTIFY_WEBHOOK_URL ?? '',
  };
}

/** Replace only the known `${VAR}` tokens; LogQL, PromQL and notification templates are left untouched. */
export function substitute(doc, substitutions) {
  const text = JSON.stringify(doc).replace(/\$\{([A-Z_]+)\}/g, (match, name) =>
    name in substitutions ? JSON.stringify(substitutions[name]).slice(1, -1) : match,
  );
  return JSON.parse(text);
}

const durationSeconds = (d) => {
  const m = /^(\d+)([smh])$/.exec(d);
  if (!m) throw new Error(`Unsupported interval ${d}`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
};

async function run(opts, env) {
  const baseUrl = (env.GRAFANA_URL ?? '').replace(/\/+$/, '');
  const token = env.GRAFANA_SA_TOKEN ?? '';
  const online = Boolean(baseUrl && token);
  const subs = substitutionsFrom(env);
  const { apply } = opts;

  async function api(method, path, body, headers = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : {};
  }

  async function step(label, action) {
    if (!apply) {
      console.log(`  [dry-run] ${label}`);
      return;
    }
    await action();
    console.log(`  [applied] ${label}`);
  }

  const folders = [...ENVS.map((e) => FOLDER(e.name)), DASHBOARD_FOLDER];
  const folderUidByTitle = Object.fromEntries(folders.map((f) => [f.title, f.uid]));
  const existingContactPoints = async () =>
    online ? ((await api('GET', '/api/v1/provisioning/contact-points')) ?? []) : [];

  async function applyFolders() {
    for (const folder of folders) {
      const existing = online ? await api('GET', `/api/folders/${folder.uid}`) : null;
      if (existing) {
        console.log(`  [ok] folder ${folder.uid} exists`);
        continue;
      }
      await step(`create folder ${folder.uid} "${folder.title}"`, () => api('POST', '/api/folders', folder));
    }
  }

  async function applyTemplates() {
    for (const tpl of buildTemplates().templates) {
      await step(`upsert notification template "${tpl.name}"`, () =>
        api('PUT', `/api/v1/provisioning/templates/${tpl.name}`, { template: tpl.template }),
      );
    }
  }

  async function applyContactPoints() {
    const existing = await existingContactPoints();
    for (const cp of substitute(buildContactPoints(), subs).contactPoints) {
      const receiver = cp.receivers[0];
      if (!receiver.settings.url) {
        const found = existing.some((e) => e.name === cp.name);
        const where = online ? (found ? ' (exists in Grafana)' : ' (MISSING in Grafana: create it in IRM)') : '';
        console.log(`  [skip] contact point "${cp.name}": its IRM webhook URL is unset${where}`);
        continue;
      }
      const body = { uid: receiver.uid, name: cp.name, type: receiver.type, settings: receiver.settings };
      const update = existing.some((e) => e.uid === receiver.uid);
      await step(`${update ? 'update' : 'create'} contact point "${cp.name}" (${receiver.type})`, () =>
        update
          ? api('PUT', `/api/v1/provisioning/contact-points/${receiver.uid}`, body)
          : api('POST', '/api/v1/provisioning/contact-points', body),
      );
    }
  }

  async function applyPolicies() {
    const [policy] = buildPolicies().policies;
    const { orgId: _orgId, ...tree } = policy;
    if (online) {
      const names = new Set((await existingContactPoints()).map((e) => e.name));
      const missing = Object.values(CONTACT_POINTS).filter((n) => !names.has(n));
      if (missing.length && apply)
        throw new Error(`Create contact point(s) ${missing.join(', ')} before applying the policy tree.`);
      if (missing.length) console.log(`  [warn] contact point(s) missing in Grafana: ${missing.join(', ')}`);
    }
    const routes = tree.routes.map((r) => r.object_matchers.map((m) => m.join('')).join(',')).join(' | ');
    await step(
      `replace the notification policy tree (default ${tree.receiver}; ${CONTACT_POINTS.oncall} for ${routes})`,
      () => api('PUT', '/api/v1/provisioning/policies', tree),
    );
  }

  /**
   * Every rule filters Loki on env="production" or env="staging" (ENV_TYPE through env-label.ts). If logs carried
   * another value (NODE_ENV is "production" on staging too), staging errors would count toward the production sev1
   * rules and every staging rule would match nothing. So rules are refused until Loki has seen every env value in
   * the last 24 h. --skip-env-check overrides it.
   */
  async function checkEnvLabels() {
    if (!online) {
      console.log('  [skip] env label check: offline');
      return;
    }
    const startNs = `${(Date.now() - 24 * 3600 * 1000) * 1e6}`;
    const path = `/api/datasources/proxy/uid/${subs.GRAFANA_LOKI_UID}/loki/api/v1/label/env/values?start=${startNs}`;
    let seen = [];
    try {
      seen = (await api('GET', path))?.data ?? [];
    } catch (err) {
      console.log(`  [warn] could not read the Loki env label values: ${err.message}`);
    }
    const missing = ENVS.map((e) => e.name).filter((name) => !seen.includes(name));
    if (!missing.length) {
      console.log(`  [ok] Loki env label values (24 h): ${seen.join(', ')}`);
      return;
    }
    const msg =
      `Loki has no logs with env=${missing.join(', env=')} in the last 24 h (seen: ${seen.join(', ') || 'none'}). ` +
      'The rules assume env comes from ENV_TYPE. Fix the log labels first, or pass --skip-env-check.';
    if (apply && !opts.skipEnvCheck) throw new Error(msg);
    console.log(`  [warn] ${msg}`);
  }

  async function applyRules() {
    await checkEnvLabels();
    const headers = opts.editable ? { 'X-Disable-Provenance': 'true' } : {};
    const files = buildRuleFiles().sort((a, b) => a.area.localeCompare(b.area));
    if (files.length === 0) console.log('  [ok] the catalog has no rules');
    for (const { doc } of files) {
      for (const group of substitute(doc, subs).groups) {
        const folderUid = folderUidByTitle[group.folder];
        if (!folderUid) throw new Error(`Unknown folder "${group.folder}"`);
        const body = {
          title: group.name,
          folderUid,
          interval: durationSeconds(group.interval),
          rules: group.rules.map((rule) => ({
            ...rule,
            folderUID: folderUid,
            ruleGroup: group.name,
            orgID: group.orgId,
          })),
        };
        // The group PUT updates and deletes rules but cannot create one with a fixed UID, so new rules are POSTed
        // first; the PUT then sets the interval and the order.
        const missing = [];
        if (online) {
          for (const rule of body.rules) {
            if (!(await api('GET', `/api/v1/provisioning/alert-rules/${rule.uid}`))) missing.push(rule);
          }
        }
        const created = missing.length ? `, creating ${missing.length}` : '';
        await step(`upsert rule group ${folderUid}/${group.name}: ${group.rules.length} rules${created}`, async () => {
          for (const rule of missing) await api('POST', '/api/v1/provisioning/alert-rules', rule, headers);
          await api('PUT', `/api/v1/provisioning/folder/${folderUid}/rule-groups/${group.name}`, body, headers);
        });
      }
    }
  }

  async function applyDashboards() {
    for (const dashboard of [...DASHBOARDS].sort((a, b) => a.uid.localeCompare(b.uid))) {
      await step(`upsert dashboard ${dashboard.uid} "${dashboard.title}"`, () =>
        api('POST', '/api/dashboards/db', {
          dashboard: { ...dashboard, id: null },
          folderUid: DASHBOARD_FOLDER.uid,
          overwrite: true,
          message: 'grafana-apply.mjs',
        }),
      );
    }
  }

  const HANDLERS = {
    folders: applyFolders,
    templates: applyTemplates,
    'contact-points': applyContactPoints,
    policies: applyPolicies,
    rules: applyRules,
    dashboards: applyDashboards,
  };

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} -> ${baseUrl || '(no GRAFANA_URL)'}; datasources loki=${subs.GRAFANA_LOKI_UID} prom=${subs.GRAFANA_PROM_UID} cloudwatch=${subs.GRAFANA_CLOUDWATCH_UID}`,
  );
  // Rule groups and dashboards land in folders, so folders always go first when either is selected.
  const needsFolders = opts.only.some((s) => ['rules', 'dashboards'].includes(s));
  for (const section of SECTIONS) {
    if (!opts.only.includes(section) && !(section === 'folders' && needsFolders)) continue;
    console.log(`\n${section}`);
    await HANDLERS[section]();
  }
  if (!apply) console.log('\nDry run only. Re-run with --apply to make these changes.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const errors = preflight({ opts, env: process.env, stale: opts.apply ? staleFiles() : [] });
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  try {
    await run(opts, process.env);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) await main();
