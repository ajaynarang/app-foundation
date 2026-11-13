// Turns the environment-agnostic rule catalog into Grafana file-provisioning objects (the shape Grafana's "Export"
// produces). scripts/generate.mjs writes them to alerting/; scripts/grafana-apply.mjs sends the same objects to the
// HTTP API.

import { RULE_AREAS } from './alert-rules.mjs';
import {
  AWS_REGION,
  CONTACT_POINTS,
  DS,
  ENVS,
  FOLDER,
  HAS_WORKER,
  RUNBOOK_BASE,
  SERVICE,
  TEMPLATE_NAME,
} from './constants.mjs';

const ORG_ID = 1;
const EXPR_DS = { type: '__expr__', uid: DS.expr };

function thresholdStep(refId, input, op, value) {
  return {
    refId,
    relativeTimeRange: { from: 0, to: 0 },
    datasourceUid: DS.expr,
    model: {
      refId,
      type: 'threshold',
      expression: input,
      datasource: EXPR_DS,
      conditions: [{ type: 'query', evaluator: { type: op, params: [value] } }],
    },
  };
}

function queryStep(rule, env) {
  const model = { refId: 'A', expr: rule.expr(env), editorMode: 'code', intervalMs: 1000, maxDataPoints: 43200 };
  if (rule.kind === 'loki') {
    model.queryType = 'instant';
  } else {
    model.instant = true;
    model.range = false;
  }
  return {
    refId: 'A',
    relativeTimeRange: { from: rule.windowSec, to: 0 },
    datasourceUid: rule.kind === 'loki' ? DS.loki : DS.prom,
    model,
  };
}

function cloudwatchSteps(rule, envSpec) {
  const metric = rule.metric(envSpec);
  return [
    {
      refId: 'A',
      relativeTimeRange: { from: rule.windowSec, to: 0 },
      datasourceUid: DS.cloudwatch,
      model: {
        refId: 'A',
        datasource: { type: 'cloudwatch', uid: DS.cloudwatch },
        queryMode: 'Metrics',
        metricQueryType: 0,
        metricEditorMode: 0,
        region: AWS_REGION,
        namespace: metric.namespace,
        metricName: metric.metricName,
        statistic: metric.statistic,
        dimensions: metric.dimensions,
        matchExact: true,
        period: '60',
        id: '',
        expression: '',
        intervalMs: 60000,
        maxDataPoints: 43200,
      },
    },
    {
      refId: 'B',
      relativeTimeRange: { from: 0, to: 0 },
      datasourceUid: DS.expr,
      model: {
        refId: 'B',
        type: 'reduce',
        expression: 'A',
        reducer: rule.reducer,
        settings: { mode: 'dropNN' },
        datasource: EXPR_DS,
      },
    },
    thresholdStep('C', 'B', rule.op, rule.threshold),
  ];
}

export const ruleUid = (envSpec, key) => `${envSpec.short}-${key}`;

function buildRule(rule, envSpec) {
  const data =
    rule.kind === 'cloudwatch'
      ? cloudwatchSteps(rule, envSpec)
      : [queryStep(rule, envSpec.name), thresholdStep('C', 'A', 'gt', 0)];
  return {
    uid: ruleUid(envSpec, rule.key),
    title: `[${envSpec.name}] ${rule.title}`,
    condition: 'C',
    data,
    noDataState: rule.noData ?? 'OK',
    execErrState: 'Error',
    for: rule.for ?? '0s',
    annotations: {
      summary: rule.summary,
      description: rule.description,
      runbook_url: `${RUNBOOK_BASE}/${rule.runbook}`,
    },
    labels: {
      severity: rule.severity,
      env: envSpec.name,
      area: rule.area,
      service: SERVICE,
      signal: rule.kind,
    },
    isPaused: false,
  };
}

/** A rule marked `requiresWorker` exists only while the product runs a worker task (HAS_WORKER). */
const included = (hasWorker) => (rule) => hasWorker || rule.requiresWorker !== true;

/**
 * An area is one provisioning file. It holds one group (`interval` + `rules`, named after the area) or several
 * (`groups: [{ name, interval, rules }]`) when its rules need different evaluation intervals.
 */
export const areaGroups = (area, { hasWorker = HAS_WORKER } = {}) =>
  (area.groups ?? [{ name: area.area, interval: area.interval, rules: area.rules }])
    .map((group) => ({ ...group, rules: group.rules.filter(included(hasWorker)) }))
    .filter((group) => group.rules.length > 0);

/** One provisioning document per area, holding that area's groups for every environment. */
export function buildRuleFiles(areas = RULE_AREAS, { hasWorker = HAS_WORKER } = {}) {
  return areas
    .map((area) => ({
      area: area.area,
      doc: {
        apiVersion: 1,
        groups: ENVS.flatMap((envSpec) =>
          areaGroups(area, { hasWorker }).map((group) => ({
            orgId: ORG_ID,
            name: group.name,
            folder: FOLDER(envSpec.name).title,
            interval: group.interval,
            rules: group.rules.map((rule) => buildRule({ ...rule, area: area.area }, envSpec)),
          })),
        ),
      },
    }))
    .filter(({ doc }) => doc.groups.length > 0);
}

const IRM_SETTINGS = (urlVar) => ({
  url: `\${${urlVar}}`,
  httpMethod: 'POST',
  title: `{{ template "${TEMPLATE_NAME}.title" . }}`,
  message: `{{ template "${TEMPLATE_NAME}.message" . }}`,
});

/** The webhook URL placeholder behind each contact point (apply-time secrets, never app config). */
export const CONTACT_POINT_URL_VARS = {
  [CONTACT_POINTS.oncall]: 'IRM_ONCALL_WEBHOOK_URL',
  [CONTACT_POINTS.notify]: 'IRM_NOTIFY_WEBHOOK_URL',
};

export function buildContactPoints() {
  return {
    apiVersion: 1,
    contactPoints: Object.entries(CONTACT_POINT_URL_VARS).map(([name, urlVar]) => ({
      orgId: ORG_ID,
      name,
      receivers: [{ uid: name, type: 'oncall', settings: IRM_SETTINGS(urlVar), disableResolveMessage: false }],
    })),
  };
}

/** The routing model: a production sev1 pages; everything else, staging sev1 included, notifies. */
export function buildPolicies() {
  return {
    apiVersion: 1,
    policies: [
      {
        orgId: ORG_ID,
        receiver: CONTACT_POINTS.notify,
        group_by: ['alertname', 'env', 'tenantId', 'jobName'],
        group_wait: '30s',
        group_interval: '5m',
        repeat_interval: '4h',
        routes: [
          {
            receiver: CONTACT_POINTS.oncall,
            object_matchers: [
              ['env', '=', 'production'],
              ['severity', '=', 'sev1'],
            ],
          },
        ],
      },
    ],
  };
}

const TEMPLATE = `{{ define "${TEMPLATE_NAME}.title" }}[{{ .Status | toUpper }}] {{ .CommonLabels.severity | toUpper }} {{ .CommonLabels.env }}: {{ .CommonLabels.alertname }}{{ end }}

{{ define "${TEMPLATE_NAME}.message" }}{{ range .Alerts }}{{ .Annotations.summary }}
{{ with .Labels.tenantId }}Tenant: {{ . }}
{{ end }}{{ with .Labels.jobName }}Job: {{ . }}
{{ end }}{{ .Annotations.description }}
Runbook: {{ .Annotations.runbook_url }}
{{ end }}{{ end }}
`;

export function buildTemplates() {
  return { apiVersion: 1, templates: [{ orgId: ORG_ID, name: TEMPLATE_NAME, template: TEMPLATE }] };
}
