#!/usr/bin/env tsx

/**
 * Confidence Matrix Generator
 *
 * Reads Playwright JSON results and produces:
 *   1. reports/confidence-matrix.json  — machine-readable
 *   2. reports/confidence-matrix.html  — interactive dashboard with clickable cards
 *   3. Console summary with progress bars
 *
 * Features:
 *   - Clickable domain cards that expand to show individual test results
 *   - Skip reasons displayed per test (why was it skipped, how to fix)
 *   - Failed tests highlighted with error details
 *   - Overall skip analysis section
 *
 * Run after tests: npx tsx scripts/generate-matrix.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = path.join(__dirname, '..', 'reports', 'results.json');
const UNIT_RESULTS_PATH = path.join(__dirname, '..', 'reports', 'unit-test-results.json');
const UNIT_COVERAGE_PATH = path.join(__dirname, '..', 'reports', 'unit-coverage-summary.json');
const MATRIX_JSON = path.join(__dirname, '..', 'reports', 'confidence-matrix.json');
const MATRIX_HTML = path.join(__dirname, '..', 'reports', 'confidence-matrix.html');

// ── Types ──

interface TestDetail {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  skipReason?: string;
  error?: string;
  duration?: number;
}

interface DomainReport {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: string;
  tests: TestDetail[];
}

interface SkipAnalysis {
  reason: string;
  count: number;
  fix: string;
}

interface UnitTestDomainReport {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: string;
  lineCoverage: number;
  linesCovered: number;
  linesTotal: number;
}

interface UnitTestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  suites: number;
  suitesPass: number;
  suitesFail: number;
  duration: number;
  overallLineCoverage: number;
  domains: Record<string, UnitTestDomainReport>;
}

interface ConfidenceMatrix {
  timestamp: string;
  target: string;
  tenant: string;
  commit: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  suites: Record<string, Record<string, DomainReport>>;
  skipAnalysis: SkipAnalysis[];
  unitTests?: UnitTestSummary;
}

// ── Test categorization ──

function categorize(title: string): { suite: string; domain: string } {
  const t = title.toLowerCase();
  if (t.includes('@rbac')) return { suite: 'rbac', domain: extractRbacDomain(t) };
  if (t.includes('@smoke')) return { suite: 'smoke', domain: 'health-auth' };
  if (t.includes('@contract')) return { suite: 'contracts', domain: extractContractDomain(t) };
  if (t.includes('@browser')) return { suite: 'browser', domain: 'ui-smoke' };
  if (t.includes('billing') || t.includes('wallet') || t.includes('subscription') || t.includes('invoice'))
    return { suite: 'workflows', domain: 'billing' };
  if (t.includes('ai') || t.includes('assistant') || t.includes('conversation') || t.includes('mcp'))
    return { suite: 'workflows', domain: 'ai' };
  if (t.includes('desk')) return { suite: 'workflows', domain: 'desk' };
  if (t.includes('super admin') || t.includes('tenant') || t.includes('broadcast') || t.includes('admin'))
    return { suite: 'workflows', domain: 'super-admin' };
  if (
    t.includes('platform') ||
    t.includes('user') ||
    t.includes('invitation') ||
    t.includes('feature flag') ||
    t.includes('api key') ||
    t.includes('feedback') ||
    t.includes('support') ||
    t.includes('notification') ||
    t.includes('setting') ||
    t.includes('webhook') ||
    t.includes('integration') ||
    t.includes('oauth') ||
    t.includes('document') ||
    t.includes('search')
  )
    return { suite: 'workflows', domain: 'platform' };
  return { suite: 'other', domain: 'uncategorized' };
}

function extractRbacDomain(t: string): string {
  if (t.includes('platform')) return 'platform';
  if (t.includes('billing')) return 'billing';
  if (t.includes('ai')) return 'ai';
  if (t.includes('desk')) return 'desk';
  if (t.includes('super-admin') || t.includes('super admin')) return 'super-admin';
  if (t.includes('infrastructure')) return 'infrastructure';
  return 'other';
}

function extractContractDomain(t: string): string {
  if (t.includes('platform')) return 'platform';
  if (t.includes('billing')) return 'billing';
  if (t.includes('ai')) return 'ai';
  if (t.includes('desk')) return 'desk';
  if (t.includes('super')) return 'super-admin';
  return 'other';
}

// ── Parse results ──

function flattenSuites(suites: any[], prefix = ''): TestDetail[] {
  const tests: TestDetail[] = [];
  for (const suite of suites) {
    const name = prefix ? `${prefix} > ${suite.title}` : suite.title;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const r = test.results?.[0];
        const status = r?.status || test.status || 'skipped';
        const skipAnn = test.annotations?.find((a: any) => a.type === 'skip' || a.type === 'fixme');
        const detail: TestDetail = {
          name: `${name} > ${spec.title}`,
          status,
          duration: r?.duration,
        };
        if (status === 'skipped') {
          detail.skipReason =
            skipAnn?.description || inferSkipReason(detail.name) || 'Role not available in test tenant';
        }
        if (status === 'failed' || status === 'timedOut') {
          detail.error = r?.error?.message?.slice(0, 200) || 'Unknown error';
        }
        tests.push(detail);
      }
    }
    if (suite.suites) {
      tests.push(...flattenSuites(suite.suites, name));
    }
  }
  return tests;
}

function inferSkipReason(testName: string): string {
  const t = testName.toLowerCase();
  if (t.includes('member')) return 'No MEMBER user in test tenant';
  if (t.includes('owner')) return 'No OWNER user in test tenant';
  if (t.includes('admin') && !t.includes('super')) return 'No ADMIN user in test tenant';
  if (t.includes('super_admin') || t.includes('superadmin')) return 'No SUPER_ADMIN user available';
  if (t.includes('feature')) return 'Feature not enabled on tenant plan';
  if (t.includes('billing') || t.includes('stripe')) return 'Billing/Stripe not configured';
  return 'Role or feature not available';
}

function buildSkipAnalysis(allTests: TestDetail[]): SkipAnalysis[] {
  const skipped = allTests.filter((t) => t.status === 'skipped');
  const reasons = new Map<string, number>();
  for (const t of skipped) {
    const r = t.skipReason || 'Unknown';
    // Normalize reason (remove tenant name variations)
    const normalized = r.replace(/tenant ".*?"/, 'tenant').replace(/feature ".*?"/, 'feature');
    reasons.set(normalized, (reasons.get(normalized) || 0) + 1);
  }

  const fixes: Record<string, string> = {
    'No MEMBER user in test tenant': 'Add a user with MEMBER role to the test tenant',
    'No MEMBER in tenant': 'Add a user with MEMBER role to the test tenant',
    'No ADMIN user in test tenant': 'Add a user with ADMIN role to the test tenant',
    'No ADMIN in tenant': 'Add a user with ADMIN role to the test tenant',
    'No OWNER user in test tenant': 'Add a user with OWNER role to the test tenant',
    'No OWNER in tenant': 'Add a user with OWNER role to the test tenant',
    'No SUPER_ADMIN user available': 'Create a SUPER_ADMIN user in the system',
    'Feature not enabled on tenant plan': 'Enable the feature on the test tenant plan via super admin',
    'Billing/Stripe not configured': 'Configure Stripe keys or use a tenant with billing set up',
    'Role or feature not available': 'Ensure all roles (OWNER, ADMIN, MEMBER, SUPER_ADMIN) exist in the test tenant',
  };

  // Fuzzy match for skip reasons that contain tenant names
  function findFix(reason: string): string {
    // Direct match
    if (fixes[reason]) return fixes[reason];
    // Fuzzy: check if any key is contained in the reason
    for (const [key, fix] of Object.entries(fixes)) {
      if (reason.toLowerCase().includes(key.toLowerCase())) return fix;
    }
    // Pattern matching
    if (reason.includes('MEMBER')) return 'Add a user with MEMBER role to the test tenant';
    if (reason.includes('OWNER')) return 'Add a user with OWNER role to the test tenant';
    if (reason.includes('ADMIN') && !reason.includes('SUPER')) return 'Add a user with ADMIN role to the test tenant';
    if (reason.includes('SUPER_ADMIN')) return 'Create a SUPER_ADMIN user in the system';
    if (reason.includes('feature') || reason.includes('not enabled'))
      return 'Enable the feature on the test tenant plan via super admin';
    if (reason.includes('Stripe') || reason.includes('billing') || reason.includes('500'))
      return 'Configure Stripe on staging or skip billing-specific tests';
    return 'Investigate the skip reason and add the missing role or feature';
  }

  return [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      fix: findFix(reason),
    }));
}

// ── Unit test parsing ──

function parseUnitTestResults(): UnitTestSummary | null {
  if (!fs.existsSync(UNIT_RESULTS_PATH)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(UNIT_RESULTS_PATH, 'utf-8'));

    // Parse Jest JSON output
    const summary: UnitTestSummary = {
      total: raw.numTotalTests || 0,
      passed: raw.numPassedTests || 0,
      failed: raw.numFailedTests || 0,
      skipped: (raw.numPendingTests || 0) + (raw.numTodoTests || 0),
      suites: raw.numTotalTestSuites || 0,
      suitesPass: raw.numPassedTestSuites || 0,
      suitesFail: raw.numFailedTestSuites || 0,
      duration: Math.round(
        (raw.testResults || []).reduce((acc: number, r: any) => acc + (r.endTime - r.startTime), 0) / 1000,
      ),
      overallLineCoverage: 0,
      domains: {},
    };

    // Parse coverage summary if available
    if (fs.existsSync(UNIT_COVERAGE_PATH)) {
      const coverage = JSON.parse(fs.readFileSync(UNIT_COVERAGE_PATH, 'utf-8'));

      // Aggregate by domain
      const domainAgg: Record<string, { lc: number; lt: number; tc: number; tp: number; tf: number; ts: number }> = {};

      for (const [filePath, metrics] of Object.entries(coverage) as [string, any][]) {
        if (filePath === 'total') continue;

        // Determine domain from file path
        let domain = 'other';
        if (filePath.includes('/domains/')) {
          const match = filePath.match(/\/domains\/([^/]+)\//);
          if (match) domain = match[1];
        } else if (filePath.includes('/auth/')) {
          domain = 'auth';
        } else if (filePath.includes('/infrastructure/')) {
          domain = 'infrastructure';
        } else if (filePath.includes('/test/')) {
          continue; // Skip test infrastructure files
        }

        if (!domainAgg[domain]) domainAgg[domain] = { lc: 0, lt: 0, tc: 0, tp: 0, tf: 0, ts: 0 };
        const l = metrics.lines || {};
        domainAgg[domain].lc += l.covered || 0;
        domainAgg[domain].lt += l.total || 0;
      }

      // Count tests per domain from Jest results (approximate by file path)
      for (const testResult of raw.testResults || []) {
        let domain = 'other';
        const tp = testResult.name || '';
        if (tp.includes('/domains/')) {
          const match = tp.match(/\/domains\/([^/]+)\//);
          if (match) domain = match[1];
        } else if (tp.includes('/auth/')) {
          domain = 'auth';
        } else if (tp.includes('/infrastructure/')) {
          domain = 'infrastructure';
        }

        if (!domainAgg[domain]) domainAgg[domain] = { lc: 0, lt: 0, tc: 0, tp: 0, tf: 0, ts: 0 };
        for (const assertion of testResult.assertionResults || []) {
          domainAgg[domain].tc++;
          if (assertion.status === 'passed') domainAgg[domain].tp++;
          else if (assertion.status === 'failed') domainAgg[domain].tf++;
          else domainAgg[domain].ts++;
        }
      }

      // Build domain reports
      for (const [domain, agg] of Object.entries(domainAgg)) {
        const linePct = agg.lt > 0 ? Math.round((agg.lc / agg.lt) * 100 * 10) / 10 : 0;
        summary.domains[domain] = {
          total: agg.tc,
          passed: agg.tp,
          failed: agg.tf,
          skipped: agg.ts,
          coverage: `${linePct}%`,
          lineCoverage: linePct,
          linesCovered: agg.lc,
          linesTotal: agg.lt,
        };
      }

      // Overall coverage
      const totalLines = coverage.total?.lines;
      if (totalLines) {
        summary.overallLineCoverage = Math.round(totalLines.pct * 10) / 10;
      }
    }

    return summary;
  } catch (e) {
    console.warn('Warning: Could not parse unit test results:', (e as Error).message);
    return null;
  }
}

// ── HTML generation ──

function generateUnitTestHtml(unit: UnitTestSummary): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const coverageColor = (pct: number) => (pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444');

  const overallColor = coverageColor(unit.overallLineCoverage);
  const statusIcon = unit.failed === 0 ? 'PASS' : 'FAIL';
  const statusColor = unit.failed === 0 ? '#22c55e' : '#ef4444';

  // Sort domains by coverage descending
  const sortedDomains = Object.entries(unit.domains).sort(([, a], [, b]) => b.lineCoverage - a.lineCoverage);

  let domainRows = '';
  for (const [domain, report] of sortedDomains) {
    const color = coverageColor(report.lineCoverage);
    const barWidth = Math.round(report.lineCoverage);
    domainRows += `
      <tr style="border-bottom:1px solid #1a1a1a">
        <td style="padding:10px 16px;color:#e5e5e5;font-weight:500">${esc(domain)}</td>
        <td style="padding:10px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="flex:1;height:6px;background:#262626;border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${barWidth}%;background:${color};border-radius:3px"></div>
            </div>
            <span style="color:${color};font-weight:600;font-size:13px;min-width:48px;text-align:right">${report.coverage}</span>
          </div>
        </td>
        <td style="padding:10px 16px;color:#a3a3a3;font-size:13px;text-align:right">${report.linesCovered}/${report.linesTotal}</td>
        <td style="padding:10px 16px;color:#22c55e;font-size:13px;text-align:right">${report.passed}</td>
        <td style="padding:10px 16px;color:${report.failed > 0 ? '#ef4444' : '#525252'};font-size:13px;text-align:right">${report.failed}</td>
      </tr>`;
  }

  return `
    <h2 style="color:#a3a3a3;margin-top:32px;text-transform:uppercase;font-size:14px;letter-spacing:1px">
      Unit Tests
      <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;background:${statusColor}20;color:${statusColor};margin-left:8px;vertical-align:middle">${statusIcon}</span>
    </h2>

    <!-- Unit test summary cards -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0">
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700">${unit.suites}</div>
        <div style="color:#737373;font-size:12px">Suites</div>
      </div>
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#22c55e">${unit.passed}</div>
        <div style="color:#737373;font-size:12px">Passed</div>
      </div>
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${unit.failed > 0 ? '#ef4444' : '#525252'}">${unit.failed}</div>
        <div style="color:#737373;font-size:12px">Failed</div>
      </div>
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${overallColor}">${unit.overallLineCoverage}%</div>
        <div style="color:#737373;font-size:12px">Line Coverage</div>
      </div>
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#a3a3a3">${unit.duration}s</div>
        <div style="color:#737373;font-size:12px">Duration</div>
      </div>
    </div>

    <!-- Per-domain coverage table -->
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid #262626">
            <th style="text-align:left;padding:12px 16px;color:#a3a3a3;font-weight:500;width:140px">Domain</th>
            <th style="text-align:left;padding:12px 16px;color:#a3a3a3;font-weight:500">Line Coverage</th>
            <th style="text-align:right;padding:12px 16px;color:#a3a3a3;font-weight:500;width:100px">Lines</th>
            <th style="text-align:right;padding:12px 16px;color:#a3a3a3;font-weight:500;width:70px">Pass</th>
            <th style="text-align:right;padding:12px 16px;color:#a3a3a3;font-weight:500;width:70px">Fail</th>
          </tr>
        </thead>
        <tbody>
          ${domainRows}
        </tbody>
      </table>
    </div>`;
}

function generateHtml(matrix: ConfidenceMatrix): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const coverageColor = (pct: number) => (pct >= 95 ? '#22c55e' : pct >= 80 ? '#eab308' : '#ef4444');

  // Build domain cards with expandable test lists
  let suiteCards = '';
  let cardIndex = 0;

  for (const [suite, domains] of Object.entries(matrix.suites)) {
    let domainRows = '';
    for (const [domain, report] of Object.entries(domains)) {
      const pct = parseInt(report.coverage) || 0;
      const color = coverageColor(pct);
      const id = `card-${cardIndex++}`;

      // Build test list HTML — every test shown individually
      let testListHtml = '';
      const failed = report.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
      const skipped = report.tests.filter((t) => t.status === 'skipped');
      const passed = report.tests.filter((t) => t.status === 'passed');

      // Status icon and color
      const statusBadge = (status: string, skipReason?: string) => {
        if (status === 'failed' || status === 'timedOut')
          return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#ef444420;color:#ef4444">FAIL</span>';
        if (status === 'skipped')
          return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#eab30820;color:#eab308">SKIP</span>';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#22c55e20;color:#22c55e">PASS</span>';
      };

      // Extract human-readable test description from the full name
      const describeTest = (t: TestDetail): { name: string; desc: string } => {
        const parts = t.name.split(' > ');
        const testName = parts[parts.length - 1] || t.name;
        // Build description from parent context
        const parentCtx = parts.length >= 3 ? parts[parts.length - 2] : '';
        let desc = '';
        if (parentCtx) desc = parentCtx;
        return { name: testName, desc };
      };

      // Failed first
      if (failed.length > 0) {
        testListHtml +=
          '<div style="margin-top:12px"><div style="color:#ef4444;font-weight:600;font-size:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Failed (' +
          failed.length +
          ')</div>';
        for (const t of failed) {
          const { name, desc } = describeTest(t);
          testListHtml += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a">
            ${statusBadge(t.status)}
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:#fca5a5">${esc(name)}</div>
              ${desc ? `<div style="font-size:11px;color:#525252">${esc(desc)}</div>` : ''}
              ${t.error ? `<div style="font-size:11px;color:#737373;margin-top:2px;font-family:monospace;word-break:break-all">${esc(t.error)}</div>` : ''}
            </div>
          </div>`;
        }
        testListHtml += '</div>';
      }

      // Skipped
      if (skipped.length > 0) {
        testListHtml +=
          '<div style="margin-top:12px"><div style="color:#eab308;font-weight:600;font-size:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Skipped (' +
          skipped.length +
          ')</div>';
        for (const t of skipped) {
          const { name, desc } = describeTest(t);
          testListHtml += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a">
            ${statusBadge(t.status)}
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:#fbbf24">${esc(name)}</div>
              ${t.skipReason ? `<div style="font-size:11px;color:#737373">Reason: ${esc(t.skipReason)}</div>` : ''}
            </div>
          </div>`;
        }
        testListHtml += '</div>';
      }

      // Passed — show every test
      if (passed.length > 0) {
        const passedId = `passed-${id}`;
        testListHtml += `<div style="margin-top:12px">
          <div onclick="document.getElementById('${passedId}').style.display=document.getElementById('${passedId}').style.display==='none'?'block':'none'" style="color:#22c55e;font-weight:600;font-size:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;user-select:none">
            Passed (${passed.length}) <span style="color:#525252;font-size:10px">click to expand</span>
          </div>
          <div id="${passedId}" style="display:none">`;
        for (const t of passed) {
          const { name, desc } = describeTest(t);
          const duration = t.duration ? `${t.duration}ms` : '';
          testListHtml += `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #0f0f0f">
            ${statusBadge(t.status)}
            <div style="flex:1;min-width:0;display:flex;justify-content:space-between;align-items:center">
              <div>
                <span style="font-size:12px;color:#a3a3a3">${esc(name)}</span>
                ${desc ? `<span style="font-size:11px;color:#525252;margin-left:6px">${esc(desc)}</span>` : ''}
              </div>
              ${duration ? `<span style="font-size:10px;color:#3f3f3f;flex-shrink:0">${duration}</span>` : ''}
            </div>
          </div>`;
        }
        testListHtml += '</div></div>';
      }

      domainRows += `
        <div style="background:#171717;border:1px solid #262626;border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div onclick="document.getElementById('${id}').style.display=document.getElementById('${id}').style.display==='none'?'block':'none';this.querySelector('.arrow').textContent=document.getElementById('${id}').style.display==='none'?'▶':'▼'" style="padding:16px;cursor:pointer;user-select:none">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span><span class="arrow" style="color:#525252;margin-right:8px;font-size:11px">▶</span><span style="font-weight:600">${esc(domain)}</span></span>
              <span style="padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;background:${color}20;color:${color}">${report.coverage}</span>
            </div>
            <div style="height:6px;background:#262626;border-radius:3px;margin:8px 0;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
            </div>
            <div style="color:#737373;font-size:13px">
              <span style="color:#22c55e">${report.passed} passed</span> ·
              <span style="color:#ef4444">${report.failed} failed</span> ·
              <span style="color:#eab308">${report.skipped} skipped</span> ·
              ${report.total} total
            </div>
          </div>
          <div id="${id}" style="display:none;padding:0 16px 16px;border-top:1px solid #262626">
            ${testListHtml}
          </div>
        </div>`;
    }

    suiteCards += `<h2 style="color:#a3a3a3;margin-top:32px;text-transform:uppercase;font-size:14px;letter-spacing:1px">${esc(suite)}</h2>${domainRows}`;
  }

  // Skip analysis section
  let skipSection = '';
  if (matrix.skipAnalysis.length > 0) {
    skipSection = `
      <h2 style="color:#a3a3a3;margin-top:32px;text-transform:uppercase;font-size:14px;letter-spacing:1px">Skip Analysis — Why tests were skipped</h2>
      <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px">`;

    for (const sa of matrix.skipAnalysis) {
      skipSection += `
        <div style="padding:8px 0;border-bottom:1px solid #262626">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#eab308;font-weight:500">${esc(sa.reason)}</span>
            <span style="color:#737373;font-size:13px">${sa.count} tests</span>
          </div>
          <div style="color:#22c55e;font-size:12px;margin-top:4px">Fix: ${esc(sa.fix)}</div>
        </div>`;
    }

    skipSection += '</div>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Platform Quality Gate — Confidence Matrix</title>
</head>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;max-width:900px;margin:0 auto;padding:24px">
  <h1 style="color:#fff;border-bottom:1px solid #333;padding-bottom:12px">
    Platform Quality Gate
  </h1>
  <div style="color:#737373;margin-bottom:24px">
    <div>Generated: ${esc(matrix.timestamp)}</div>
    <div>Target: ${esc(matrix.target)} · Tenant: ${esc(matrix.tenant)} · Commit: ${esc(matrix.commit)}</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0">
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700">${matrix.summary.total}</div>
      <div style="color:#737373;font-size:14px">Total</div>
    </div>
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#22c55e">${matrix.summary.passed}</div>
      <div style="color:#737373;font-size:14px">Passed</div>
    </div>
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#ef4444">${matrix.summary.failed}</div>
      <div style="color:#737373;font-size:14px">Failed</div>
    </div>
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#eab308">${matrix.summary.skipped}</div>
      <div style="color:#737373;font-size:14px">Skipped</div>
    </div>
  </div>

  ${matrix.unitTests ? generateUnitTestHtml(matrix.unitTests) : ''}

  <!-- Test Suite Legend -->
  <h2 style="color:#a3a3a3;margin-top:32px;text-transform:uppercase;font-size:14px;letter-spacing:1px">What Each Suite Tests</h2>
  <div style="background:#171717;border:1px solid #262626;border-radius:8px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:1px solid #262626">
          <th style="text-align:left;padding:12px 16px;color:#a3a3a3;font-weight:500;width:140px">Suite</th>
          <th style="text-align:left;padding:12px 16px;color:#a3a3a3;font-weight:500">What it proves</th>
          <th style="text-align:left;padding:12px 16px;color:#a3a3a3;font-weight:500">Example check</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">Unit Tests</td>
          <td style="padding:10px 16px;color:#a3a3a3">Backend service logic is correct in isolation</td>
          <td style="padding:10px 16px;color:#525252">Service logic edge cases, guard chains, enum codegen parity, JWT guard rejects expired tokens</td>
        </tr>
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">Smoke</td>
          <td style="padding:10px 16px;color:#a3a3a3">System is alive, users can authenticate</td>
          <td style="padding:10px 16px;color:#525252">Health returns 200, MEMBER token works, critical GETs don't 500</td>
        </tr>
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">RBAC</td>
          <td style="padding:10px 16px;color:#a3a3a3">Only correct roles can access each endpoint</td>
          <td style="padding:10px 16px;color:#525252">MEMBER can't manage users (403), ADMIN can list users (200), anonymous gets 401</td>
        </tr>
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">Workflows</td>
          <td style="padding:10px 16px;color:#a3a3a3">Domain features work end-to-end per business area</td>
          <td style="padding:10px 16px;color:#525252">
            <b>Platform:</b> users, invitations, feature flags, plans, settings<br>
            <b>Billing:</b> subscriptions, wallet, payment methods<br>
            <b>AI:</b> conversations, assistant, MCP<br>
            <b>Super Admin:</b> tenants, broadcasts, feedback admin
          </td>
        </tr>
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">Contracts</td>
          <td style="padding:10px 16px;color:#a3a3a3">API response shapes haven't changed — fields exist, types match</td>
          <td style="padding:10px 16px;color:#525252">User response has <code>userId</code> (string), <code>email</code> (string). If removed or renamed, test fails. New fields are fine.</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#e5e5e5;font-weight:600">Browser</td>
          <td style="padding:10px 16px;color:#a3a3a3">Real user can login and navigate the UI</td>
          <td style="padding:10px 16px;color:#525252">Login page works, dashboard renders, no JS errors, pages load without 500s</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${suiteCards}
  ${skipSection}

  <div style="color:#525252;font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid #262626">
    Click any domain card to expand and see individual test results, skip reasons, and failure details.
  </div>
</body>
</html>`;
}

function getTenantDisplay(): string {
  const id = process.env.TENANT_ID || 'unknown';
  try {
    const authStatePath = path.join(__dirname, '..', 'config', 'auth-state.json');
    if (fs.existsSync(authStatePath)) {
      const state = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
      if (state.tenantName) return `${state.tenantName} (${state.tenantId})`;
    }
  } catch {}
  return id;
}

// ── Main ──

async function main(): Promise<void> {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error('❌ No test results found at', RESULTS_PATH);
    console.error('   Run tests first: npx playwright test');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
  const allTests = flattenSuites(raw.suites || []);
  const skipAnalysis = buildSkipAnalysis(allTests);

  // Build matrix
  const suites: Record<string, Record<string, DomainReport>> = {};

  for (const t of allTests) {
    const { suite, domain } = categorize(t.name);
    if (!suites[suite]) suites[suite] = {};
    if (!suites[suite][domain]) {
      suites[suite][domain] = { total: 0, passed: 0, failed: 0, skipped: 0, coverage: '0%', tests: [] };
    }

    const report = suites[suite][domain];
    report.total++;
    if (t.status === 'passed') report.passed++;
    else if (t.status === 'failed' || t.status === 'timedOut') report.failed++;
    else report.skipped++;
    report.tests.push(t);
  }

  // Calculate coverage
  for (const domains of Object.values(suites)) {
    for (const report of Object.values(domains)) {
      report.coverage = report.total > 0 ? `${Math.round((report.passed / report.total) * 100)}%` : '0%';
    }
  }

  // Parse unit test results (if available from CI)
  const unitTests = parseUnitTestResults();

  // Include unit test counts in overall summary
  const e2ePassed = allTests.filter((t) => t.status === 'passed').length;
  const e2eFailed = allTests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
  const e2eSkipped = allTests.filter((t) => t.status === 'skipped').length;

  const matrix: ConfidenceMatrix = {
    timestamp: new Date().toISOString(),
    target: process.env.API_BASE_URL || 'local',
    tenant: getTenantDisplay(),
    commit: process.env.GITHUB_SHA?.slice(0, 8) || 'local',
    summary: {
      total: allTests.length + (unitTests?.total || 0),
      passed: e2ePassed + (unitTests?.passed || 0),
      failed: e2eFailed + (unitTests?.failed || 0),
      skipped: e2eSkipped + (unitTests?.skipped || 0),
    },
    suites,
    skipAnalysis,
    unitTests: unitTests || undefined,
  };

  // Write outputs
  const reportsDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  fs.writeFileSync(MATRIX_JSON, JSON.stringify(matrix, null, 2));
  fs.writeFileSync(MATRIX_HTML, generateHtml(matrix));

  // Console output
  console.log('\n═══════════════════════════════════════════');
  console.log('  Platform Quality Gate');
  console.log('═══════════════════════════════════════════');
  console.log(`  Target:  ${matrix.target}`);
  console.log(`  Tenant:  ${matrix.tenant}`);
  console.log(`  Commit:  ${matrix.commit}`);
  console.log(
    `  Total: ${matrix.summary.total} | ✅ ${matrix.summary.passed} | ❌ ${matrix.summary.failed} | ⏭ ${matrix.summary.skipped}`,
  );
  console.log('');

  // Unit test summary
  if (matrix.unitTests) {
    const u = matrix.unitTests;
    const icon = u.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`  UNIT TESTS [${icon}]`);
    console.log(
      `    ${u.suites} suites | ${u.passed} passed | ${u.failed} failed | ${u.skipped} skipped | ${u.overallLineCoverage}% line coverage | ${u.duration}s`,
    );
    console.log('');
    for (const [domain, report] of Object.entries(u.domains).sort(([, a], [, b]) => b.lineCoverage - a.lineCoverage)) {
      const pct = report.lineCoverage;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      console.log(
        `    ${domain.padEnd(20)} ${bar} ${report.coverage.padStart(6)}  ${String(report.linesCovered).padStart(5)}/${String(report.linesTotal).padStart(5)} lines`,
      );
    }
    console.log('');
  }

  // E2E suites
  for (const [suite, domains] of Object.entries(matrix.suites)) {
    console.log(`  ${suite.toUpperCase()}`);
    for (const [domain, report] of Object.entries(domains)) {
      const pct = parseInt(report.coverage) || 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      const icon = report.failed > 0 ? 'WARN' : 'OK';
      console.log(
        `    ${domain.padEnd(20)} ${bar} ${String(report.passed).padStart(3)}/${String(report.total).padStart(3)}  ${report.coverage.padStart(4)}  ${icon}`,
      );
    }
    console.log('');
  }

  if (skipAnalysis.length > 0) {
    console.log('  SKIP ANALYSIS');
    for (const sa of skipAnalysis) {
      console.log(`    ${String(sa.count).padStart(4)}x  ${sa.reason}`);
      console.log(`          Fix: ${sa.fix}`);
    }
    console.log('');
  }

  console.log(`  Reports saved:`);
  console.log(`    JSON: ${MATRIX_JSON}`);
  console.log(`    HTML: ${MATRIX_HTML}`);
  console.log('');
}

main().catch(console.error);
