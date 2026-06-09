#!/usr/bin/env node

/**
 * Load Test Baseline — Platform API
 *
 * Hits the top 10 most-used endpoints with 50 concurrent users for 30 seconds.
 * Purpose: catch performance regressions (N+1 queries, slow joins, missing indexes).
 *
 * NOT a full load/stress test. Run monthly or before releases.
 *
 * Usage:
 *   API_BASE_URL=https://staging.appshore.in/api/v1 \
 *   AUTH_TOKEN=<jwt> \
 *   node loadtest/run.mjs
 *
 * Requirements: pnpm add -D autocannon
 *
 * 🔜 Future: schedule via GitHub Actions (monthly cron)
 */

import autocannon from 'autocannon';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8001/api/v1';
const TOKEN = process.env.AUTH_TOKEN;

if (!TOKEN) {
  console.error('❌ AUTH_TOKEN required.');
  console.error('   Get one via: curl -X POST <base>/dev/switch -d \'{"userId":"<id>"}\' -H "Content-Type: application/json"');
  process.exit(1);
}

const ENDPOINTS = [
  { method: 'GET', path: '/health/ready', description: 'Health (baseline)' },
  { method: 'GET', path: '/loads', description: 'List loads' },
  { method: 'GET', path: '/drivers', description: 'List drivers' },
  { method: 'GET', path: '/vehicles', description: 'List vehicles' },
  { method: 'GET', path: '/customers', description: 'List customers' },
  { method: 'GET', path: '/invoices', description: 'List invoices' },
  { method: 'GET', path: '/settlements', description: 'List settlements' },
  { method: 'GET', path: '/alerts', description: 'List alerts' },
  { method: 'GET', path: '/notifications', description: 'List notifications' },
  { method: 'GET', path: '/command-center/overview', description: 'Command center' },
];

const DURATION_SECONDS = 30;
const CONNECTIONS = 50;

console.log(`\n⚡ Platform Load Test Baseline`);
console.log(`   Target: ${BASE_URL}`);
console.log(`   Connections: ${CONNECTIONS}`);
console.log(`   Duration: ${DURATION_SECONDS}s per endpoint`);
console.log(`   Endpoints: ${ENDPOINTS.length}\n`);

const results = [];

for (const endpoint of ENDPOINTS) {
  const url = `${BASE_URL}${endpoint.path}`;
  console.log(`\n📊 Testing: ${endpoint.description} (${endpoint.method} ${endpoint.path})`);

  const result = await autocannon({
    url,
    method: endpoint.method,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const summary = {
    endpoint: endpoint.path,
    description: endpoint.description,
    requests: result.requests.total,
    rps: Math.round(result.requests.average),
    latencyAvg: Math.round(result.latency.average),
    latencyP50: result.latency.p50,
    latencyP99: result.latency.p99,
    errors: result.errors,
    timeouts: result.timeouts,
    nonSuccess: result.non2xx,
  };

  results.push(summary);

  const statusIcon = summary.latencyP99 > 2000 ? '🔴' : summary.latencyP99 > 500 ? '🟡' : '🟢';
  console.log(`   ${statusIcon} RPS: ${summary.rps} | Avg: ${summary.latencyAvg}ms | P99: ${summary.latencyP99}ms | Errors: ${summary.errors}`);
}

// Summary table
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  LOAD TEST RESULTS');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Endpoint              | RPS   | Avg(ms) | P99(ms) | Errors');
console.log('  ────────────────────  | ──── | ─────── | ─────── | ──────');

for (const r of results) {
  const name = r.description.padEnd(22);
  const rps = String(r.rps).padStart(5);
  const avg = String(r.latencyAvg).padStart(7);
  const p99 = String(r.latencyP99).padStart(7);
  const errors = String(r.errors).padStart(6);
  console.log(`  ${name} | ${rps} | ${avg} | ${p99} | ${errors}`);
}

// Flag regressions
const slow = results.filter((r) => r.latencyP99 > 2000);
if (slow.length > 0) {
  console.log('\n🔴 PERFORMANCE REGRESSIONS DETECTED:');
  for (const r of slow) {
    console.log(`   ${r.description}: P99 = ${r.latencyP99}ms (threshold: 2000ms)`);
  }
}

const errorful = results.filter((r) => r.errors > 0 || r.nonSuccess > 0);
if (errorful.length > 0) {
  console.log('\n🔴 ENDPOINTS WITH ERRORS:');
  for (const r of errorful) {
    console.log(`   ${r.description}: ${r.errors} errors, ${r.nonSuccess} non-2xx`);
  }
}

if (slow.length === 0 && errorful.length === 0) {
  console.log('\n✅ All endpoints within acceptable thresholds.');
}

console.log('');
