// Minimal dashboard builder: rows of panels laid out left to right on Grafana's 24-column grid. Datasources are
// dashboard variables (loki / prom / cloudwatch), so the JSON carries no stack-specific UIDs.

import { AWS_REGION, ENVS, LEVEL, PROJECT, SERVICE, awsNames } from '../constants.mjs';

/** The Loki selector for the selected environment. */
export const SEL = `{service="${SERVICE}", env="$env"}`;
/** The PromQL matcher for the selected environment, with optional extra matchers. */
export const M = (extra = '') => `job="${SERVICE}", env="$env"${extra ? `, ${extra}` : ''}`;
export const ERR = LEVEL.error;

/** AWS names for the selected environment. The dashboard `env` variable's values are the Terraform `env` values. */
export const AWS = awsNames(`${PROJECT}-$env`);

const DS_REF = {
  loki: { type: 'loki', uid: '${loki}' },
  prom: { type: 'prometheus', uid: '${prom}' },
  cloudwatch: { type: 'cloudwatch', uid: '${cloudwatch}' },
};

export const loki = (expr, legendFormat = '', opts = {}) => ({
  datasource: DS_REF.loki,
  expr,
  legendFormat,
  queryType: opts.instant ? 'instant' : 'range',
  editorMode: 'code',
});

export const prom = (expr, legendFormat = '', opts = {}) => ({
  datasource: DS_REF.prom,
  expr,
  legendFormat,
  instant: opts.instant === true,
  range: opts.instant !== true,
  editorMode: 'code',
});

export const cw = (namespace, metricName, statistic, dimensions, label = '') => ({
  datasource: DS_REF.cloudwatch,
  queryMode: 'Metrics',
  metricQueryType: 0,
  metricEditorMode: 0,
  region: AWS_REGION,
  namespace,
  metricName,
  statistic,
  dimensions,
  matchExact: true,
  period: '',
  id: '',
  expression: '',
  label,
});

/** A panel spec: { type, title, targets, w?, h?, unit?, decimals?, description?, thresholds?, options? } */
function toPanel(spec, id, gridPos) {
  const fieldConfig = { defaults: {}, overrides: [] };
  if (spec.unit) fieldConfig.defaults.unit = spec.unit;
  if (spec.decimals !== undefined) fieldConfig.defaults.decimals = spec.decimals;
  if (spec.thresholds) {
    fieldConfig.defaults.thresholds = { mode: 'absolute', steps: spec.thresholds };
    fieldConfig.defaults.color = { mode: 'thresholds' };
  }
  if (spec.type === 'timeseries' && spec.thresholds) {
    fieldConfig.defaults.custom = { thresholdsStyle: { mode: 'line' } };
  }
  return {
    id,
    type: spec.type,
    title: spec.title,
    description: spec.description ?? '',
    datasource: spec.targets[0].datasource,
    gridPos,
    targets: spec.targets.map((target, i) => ({ refId: String.fromCharCode(65 + i), ...target })),
    fieldConfig,
    options: spec.options ?? {},
  };
}

/** Neutral, then caution, then critical. Grafana's named colors. */
export const steps = (cautionAt, criticalAt) => [
  { color: 'text', value: null },
  { color: 'yellow', value: cautionAt },
  { color: 'red', value: criticalAt },
];

/** Inverted: low is bad (free storage, availability, heartbeats). */
export const stepsLowBad = (criticalBelow, cautionBelow) => [
  { color: 'red', value: null },
  { color: 'yellow', value: criticalBelow },
  { color: 'text', value: cautionBelow },
];

function layout(rows) {
  const panels = [];
  let id = 1;
  let y = 0;
  for (const row of rows) {
    panels.push({
      id: id++,
      type: 'row',
      title: row.title,
      collapsed: false,
      gridPos: { h: 1, w: 24, x: 0, y },
      panels: [],
    });
    y += 1;
    let x = 0;
    let rowHeight = 0;
    for (const spec of row.panels.filter(Boolean)) {
      const w = spec.w ?? 12;
      const h = spec.h ?? 8;
      if (x + w > 24) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      panels.push(toPanel(spec, id++, { h, w, x, y }));
      x += w;
      rowHeight = Math.max(rowHeight, h);
    }
    y += rowHeight;
  }
  return panels;
}

const dsVar = (name, label, pluginId) => ({
  name,
  label,
  type: 'datasource',
  query: pluginId,
  current: {},
  hide: 0,
  refresh: 1,
  regex: '',
  options: [],
});

const [firstEnv] = ENVS;
export const ENV_VAR = {
  name: 'env',
  label: 'Environment',
  type: 'custom',
  query: ENVS.map((e) => e.name).join(','),
  current: { text: firstEnv.name, value: firstEnv.name, selected: true },
  options: ENVS.map((e) => ({ text: e.name, value: e.name, selected: e === firstEnv })),
  hide: 0,
};

export const TENANT_VAR = {
  name: 'tenant',
  label: 'Tenant ID',
  type: 'textbox',
  query: '',
  current: { text: '', value: '' },
  hide: 0,
  description:
    'The public tenant id (tenantId on log lines, tenant on metrics). Ids only: never a name, phone or email.',
};

/**
 * @param {{uid:string,title:string,description:string,tags?:string[],uses:('loki'|'prom'|'cloudwatch')[],extraVars?:object[],from?:string,rows:object[]}} spec
 */
export function dashboard(spec) {
  const dsVars = [];
  if (spec.uses.includes('loki')) dsVars.push(dsVar('loki', 'Logs', 'loki'));
  if (spec.uses.includes('prom')) dsVars.push(dsVar('prom', 'Metrics', 'prometheus'));
  if (spec.uses.includes('cloudwatch')) dsVars.push(dsVar('cloudwatch', 'CloudWatch', 'cloudwatch'));
  return {
    uid: `${PROJECT}-${spec.uid}`,
    title: `${PROJECT} · ${spec.title}`,
    description: spec.description,
    tags: [PROJECT, ...(spec.tags ?? [])],
    timezone: 'browser',
    editable: true,
    graphTooltip: 1,
    schemaVersion: 39,
    refresh: '1m',
    time: { from: spec.from ?? 'now-6h', to: 'now' },
    templating: { list: [ENV_VAR, ...dsVars, ...(spec.extraVars ?? [])] },
    annotations: {
      list: [
        {
          name: 'Deploys',
          datasource: { type: 'grafana', uid: '-- Grafana --' },
          enable: true,
          iconColor: 'blue',
          target: { type: 'tags', tags: ['deploy', '$env'], matchAny: false, limit: 100 },
        },
      ],
    },
    panels: layout(spec.rows),
  };
}
