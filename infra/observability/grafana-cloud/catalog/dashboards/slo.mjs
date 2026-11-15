import { M, dashboard, prom, steps, stepsLowBad } from './kit.mjs';

// Two SLOs: 99.5% of non-4xx API requests succeed (30-day window); API p95 under 1 s. Both read the HTTP server
// histogram from the auto-instrumentation.
const HTTP = 'http_server_request_duration_seconds';
const BUDGET = 0.005;
const errors = (w) => `sum(rate(${HTTP}_count{${M('http_response_status_code=~"5.."')}}[${w}]))`;
const eligible = (w) => `sum(rate(${HTTP}_count{${M('http_response_status_code!~"4.."')}}[${w}]))`;
const errorRatio = (w) => `(${errors(w)} / ${eligible(w)})`;
const burnRate = (w) => `${errorRatio(w)} / ${BUDGET}`;

export default dashboard({
  uid: 'slo',
  title: 'SLOs',
  description:
    'API availability (99.5% of non-4xx requests succeed, 30-day window) and latency (p95 under 1 s). Burn-rate lines at 14.4x (page) and 6x (notify) match the burn-rate alert rules.',
  tags: ['slo'],
  uses: ['prom'],
  from: 'now-7d',
  rows: [
    {
      title: 'Availability: 99.5%',
      panels: [
        {
          type: 'stat',
          title: 'Availability, 30 days',
          w: 6,
          h: 5,
          unit: 'percentunit',
          decimals: 3,
          thresholds: stepsLowBad(0.995, 0.998),
          targets: [prom(`1 - ${errorRatio('30d')}`, '', { instant: true })],
        },
        {
          type: 'stat',
          title: 'Error budget left, 30 days',
          w: 6,
          h: 5,
          unit: 'percentunit',
          thresholds: stepsLowBad(0.1, 0.5),
          targets: [prom(`1 - (${errorRatio('30d')} / ${BUDGET})`, '', { instant: true })],
        },
        {
          type: 'stat',
          title: 'Burn rate, 1 h',
          w: 6,
          h: 5,
          decimals: 1,
          thresholds: steps(6, 14.4),
          targets: [prom(burnRate('1h'), '', { instant: true })],
        },
        {
          type: 'stat',
          title: 'Burn rate, 6 h',
          w: 6,
          h: 5,
          decimals: 1,
          thresholds: steps(6, 14.4),
          targets: [prom(burnRate('6h'), '', { instant: true })],
        },
        {
          type: 'timeseries',
          title: 'Burn rate (1 h, 6 h, 5 min, 30 min)',
          w: 24,
          thresholds: steps(6, 14.4),
          targets: [
            prom(burnRate('1h'), '1h'),
            prom(burnRate('6h'), '6h'),
            prom(burnRate('5m'), '5m'),
            prom(burnRate('30m'), '30m'),
          ],
        },
      ],
    },
    {
      title: 'Latency: p95 under 1 s',
      panels: [
        {
          type: 'timeseries',
          title: 'API p95 latency',
          unit: 's',
          thresholds: steps(0.75, 1),
          targets: [
            prom(`histogram_quantile(0.95, sum by (le) (rate(${HTTP}_bucket{${M()}}[$__rate_interval])))`, 'p95'),
          ],
        },
        {
          type: 'timeseries',
          title: 'Share of requests faster than 1 s',
          unit: 'percentunit',
          thresholds: stepsLowBad(0.95, 0.97),
          targets: [
            prom(
              `sum(rate(${HTTP}_bucket{${M('le="1"')}}[$__rate_interval])) / sum(rate(${HTTP}_count{${M()}}[$__rate_interval]))`,
              'under 1 s',
            ),
          ],
        },
        {
          type: 'table',
          title: 'Slowest routes, p95 (range)',
          w: 24,
          unit: 's',
          targets: [
            prom(
              `topk(15, histogram_quantile(0.95, sum by (le, http_route) (rate(${HTTP}_bucket{${M()}}[$__range]))))`,
              '{{http_route}}',
              { instant: true },
            ),
          ],
        },
      ],
    },
  ],
});
