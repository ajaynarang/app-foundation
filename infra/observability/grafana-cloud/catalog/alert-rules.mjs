// The alert rule catalog: one area per rule group, environment-agnostic. build-alerting.mjs turns each area into one
// provisioning file per area holding that area's group for every environment.
//
// A rule:
//   {
//     key: 'api-5xx-rate',            // unique; the rule uid is `<env short>-<key>`, at most 40 characters
//     title: 'API 5xx rate',
//     severity: 'sev1' | 'sev2',      // sev1 in production pages (irm-oncall); everything else notifies
//     kind: 'loki' | 'prom' | 'cloudwatch',
//     expr: (env) => '…',             // loki/prom: the query, filtered on env="<env>"
//     metric: (envSpec) => ({ namespace, metricName, statistic, dimensions }),   // cloudwatch only
//     reducer, op, threshold,         // cloudwatch only
//     windowSec: 600,                 // the query's look-back
//     for: '5m',                      // optional pending period
//     noData: 'OK' | 'Alerting' | 'NoData',
//     summary, description,
//     runbook: 'api.md#api-5xx-rate', // a file under docs/runbooks/ and one of its `## <key>` headings
//   }
//
// Rules ship live, never paused: the template has no older rules to swap them in for.
//
// An area: { area: 'api', interval: '1m', rules: [...] }, or { area, groups: [{ name, interval, rules }] } when its
// rules need different evaluation intervals.

/** @type {Array<{ area: string, interval?: string, rules?: object[], groups?: object[] }>} */
export const RULE_AREAS = [];
