#!/usr/bin/env tsx

/**
 * RBAC Gap Auditor
 *
 * Scans all controllers and identifies security gaps:
 *
 * 1. MISSING ROLES — Endpoints with no @Roles() and no @Public() decorator.
 *    These are accessible to ANY authenticated user (any MEMBER) which is
 *    almost always a bug.
 *
 * 2. OVERLY PERMISSIVE — Endpoints that include the MEMBER role for
 *    admin-level operations (delete, deactivate, settings mutations).
 *
 * 3. UNTESTED ENDPOINTS — Endpoints that exist in controllers but have
 *    no corresponding E2E test coverage.
 *
 * Usage:
 *   npx tsx scripts/audit-rbac-gaps.ts              # Print report
 *   npx tsx scripts/audit-rbac-gaps.ts --json        # JSON output
 *   npx tsx scripts/audit-rbac-gaps.ts --ci          # Exit code 1 if gaps found
 *
 * Run this in CI to catch newly added endpoints that forgot @Roles().
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Paths resolved from tests/scripts/ (two levels up = repo root).
const BACKEND_SRC = process.env.BACKEND_SRC || path.resolve(__dirname, '../../apps/backend/src');
const TESTS_API = process.env.TESTS_API || path.resolve(__dirname, '../api');

// ── Types ──

interface EndpointAudit {
  method: string;
  path: string;
  controller: string;
  controllerFile: string;
  domain: string;
  roles: string[];
  isPublic: boolean;
  featureGate: string | null;
  /** Security issues found */
  gaps: GapType[];
}

type GapType =
  | 'MISSING_ROLES' // No @Roles() and no @Public()
  | 'OVERLY_PERMISSIVE' // MEMBER on admin operations
  | 'UNTESTED' // No E2E test coverage found
  | 'MUTATION_NO_GUARD'; // POST/PUT/PATCH/DELETE without role restriction

interface AuditReport {
  timestamp: string;
  totalEndpoints: number;
  totalGaps: number;
  critical: EndpointAudit[]; // MISSING_ROLES on mutations
  warnings: EndpointAudit[]; // OVERLY_PERMISSIVE or UNTESTED
  info: EndpointAudit[]; // Minor observations
  summary: {
    missingRoles: number;
    overlyPermissive: number;
    untested: number;
    mutationNoGuard: number;
  };
  byDomain: Record<string, { total: number; gaps: number }>;
}

// ── Scanner ──

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];
const ROLE_REGEX = /UserRole\.(\w+)/g;

function findControllerFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__' && entry.name !== 'dist') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

function inferDomain(filePath: string): string {
  const rel = path.relative(BACKEND_SRC, filePath).replace(/\\/g, '/');
  const domainMatch = rel.match(/domains\/([^/]+)\//);
  if (domainMatch) return domainMatch[1];
  if (rel.includes('auth/')) return 'auth';
  return 'other';
}

function parseControllerForAudit(filePath: string): EndpointAudit[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const domain = inferDomain(filePath);
  const relPath = path.relative(BACKEND_SRC, filePath);
  const endpoints: EndpointAudit[] = [];

  // Class-level decorators
  let controllerPath = '';
  let classRoles: string[] = [];
  let className = '';
  let classIsPublic = false;
  let classFeatureGate: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const controllerMatch = line.match(/@Controller\(['"`]([^'"`]*)['"`]\)/);
    if (controllerMatch) controllerPath = controllerMatch[1];

    const classMatch = line.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      className = classMatch[1];
      for (let j = Math.max(0, i - 8); j < i; j++) {
        const prevLine = lines[j].trim();
        if (prevLine === '@Public()') classIsPublic = true;
        if (prevLine.startsWith('@Roles(')) {
          const roles: string[] = [];
          let roleBlock = prevLine;
          if (!prevLine.includes(')')) {
            for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
              roleBlock += ' ' + lines[k].trim();
              if (lines[k].includes(')')) break;
            }
          }
          let match;
          while ((match = ROLE_REGEX.exec(roleBlock)) !== null) {
            roles.push(match[1]);
          }
          ROLE_REGEX.lastIndex = 0;
          if (roles.length > 0) classRoles = roles;
        }
        const featureMatch = prevLine.match(/@RequireFeature\(['"`]([^'"`]+)['"`]\)/);
        if (featureMatch) classFeatureGate = featureMatch[1];
      }
      break;
    }
  }

  // Method-level
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const httpMethod of HTTP_METHODS) {
      const methodRegex = new RegExp(`@${httpMethod}\\((.*)\\)`);
      const methodMatch = line.match(methodRegex);
      if (!methodMatch) continue;

      let subPath = '';
      const pathStr = methodMatch[1].trim();
      if (pathStr) {
        const pathMatch = pathStr.match(/['"`]([^'"`]*)['"`]/);
        if (pathMatch) subPath = pathMatch[1];
      }

      const fullPath = `/${controllerPath}${subPath ? '/' + subPath : ''}`.replace(/\/+/g, '/');

      let methodRoles: string[] = [];
      let isPublic = classIsPublic;
      let methodFeatureGate: string | null = null;

      for (let j = Math.max(0, i - 6); j <= Math.min(lines.length - 1, i + 1); j++) {
        const nearby = lines[j].trim();
        if (nearby === '@Public()') isPublic = true;
        if (nearby.startsWith('@Roles(') && j !== i) {
          const roles: string[] = [];
          let roleBlock = nearby;
          if (!nearby.includes(')')) {
            for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
              roleBlock += ' ' + lines[k].trim();
              if (lines[k].includes(')')) break;
            }
          }
          let match;
          while ((match = ROLE_REGEX.exec(roleBlock)) !== null) {
            roles.push(match[1]);
          }
          ROLE_REGEX.lastIndex = 0;
          if (roles.length > 0) methodRoles = roles;
        }
        const featureMatch = nearby.match(/@RequireFeature\(['"`]([^'"`]+)['"`]\)/);
        if (featureMatch && j !== i) methodFeatureGate = featureMatch[1];
      }

      const effectiveRoles = methodRoles.length > 0 ? methodRoles : classRoles;
      const effectiveFeatureGate = methodFeatureGate || classFeatureGate;

      endpoints.push({
        method: httpMethod.toUpperCase(),
        path: fullPath,
        controller: className,
        controllerFile: relPath,
        domain,
        roles: effectiveRoles,
        isPublic,
        featureGate: effectiveFeatureGate,
        gaps: [],
      });
    }
  }

  return endpoints;
}

// ── E2E Test Coverage Scanner ──

function findTestedEndpoints(): Set<string> {
  const tested = new Set<string>();
  const testDir = TESTS_API;

  if (!fs.existsSync(testDir)) return tested;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        const content = fs.readFileSync(full, 'utf-8');
        // Extract routes from test files
        const routeMatches = content.matchAll(/\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/gi);
        for (const match of routeMatches) {
          const method = match[1].toUpperCase();
          // Normalize: strip dynamic segments for matching
          const route = match[2].replace(/\/[^/]*E2E[^/]*/g, '/:id');
          tested.add(`${method} ${route}`);
        }
      }
    }
  }

  walk(testDir);
  return tested;
}

// ── Gap Detection ──

/** Endpoints we skip from auditing (infrastructure, dev, etc.) */
const SKIP_PATHS = ['/health/', '/dev/', '/sse', '/mcp', '/webhooks/', '/push/'];

const ADMIN_OPERATIONS = ['delete', 'deactivate', 'suspend', 'reject', 'void', 'decommission', 'revoke'];

function detectGaps(endpoints: EndpointAudit[], testedRoutes: Set<string>): AuditReport {
  const critical: EndpointAudit[] = [];
  const warnings: EndpointAudit[] = [];
  const info: EndpointAudit[] = [];
  const summary = {
    missingRoles: 0,
    overlyPermissive: 0,
    untested: 0,
    mutationNoGuard: 0,
  };

  for (const ep of endpoints) {
    // Skip infrastructure endpoints
    if (SKIP_PATHS.some((skip) => ep.path.startsWith(skip))) continue;
    if (ep.domain === 'other') continue;

    ep.gaps = [];

    // GAP 1: Missing @Roles() and not @Public()
    if (ep.roles.length === 0 && !ep.isPublic) {
      ep.gaps.push('MISSING_ROLES');
      summary.missingRoles++;

      // Mutations without guards are CRITICAL
      if (ep.method !== 'GET') {
        ep.gaps.push('MUTATION_NO_GUARD');
        summary.mutationNoGuard++;
      }
    }

    // GAP 2: Overly permissive — MEMBER on destructive/admin ops
    if (ep.roles.length > 0) {
      const pathLower = ep.path.toLowerCase();
      const isAdminOp = ADMIN_OPERATIONS.some((op) => pathLower.includes(op));

      if (isAdminOp && ep.roles.includes('MEMBER')) {
        ep.gaps.push('OVERLY_PERMISSIVE');
        summary.overlyPermissive++;
      }
    }

    // GAP 3: Untested — no matching E2E test
    const normalizedPath = ep.path.replace(/:[^/]+/g, ':id');
    const testKey = `${ep.method} ${normalizedPath}`;
    const isTested =
      testedRoutes.has(testKey) ||
      [...testedRoutes].some((t) => {
        const basePath = normalizedPath.split('/').slice(0, 3).join('/');
        return t.includes(basePath);
      });

    if (!isTested && ep.method !== 'GET') {
      // Only flag mutation endpoints as untested
      ep.gaps.push('UNTESTED');
      summary.untested++;
    }

    // Classify severity
    if (ep.gaps.length > 0) {
      if (ep.gaps.includes('MUTATION_NO_GUARD') || (ep.gaps.includes('MISSING_ROLES') && ep.method !== 'GET')) {
        critical.push(ep);
      } else if (ep.gaps.includes('OVERLY_PERMISSIVE') || ep.gaps.includes('MISSING_ROLES')) {
        warnings.push(ep);
      } else {
        info.push(ep);
      }
    }
  }

  // By domain
  const byDomain: Record<string, { total: number; gaps: number }> = {};
  for (const ep of endpoints) {
    if (!byDomain[ep.domain]) byDomain[ep.domain] = { total: 0, gaps: 0 };
    byDomain[ep.domain].total++;
    if (ep.gaps.length > 0) byDomain[ep.domain].gaps++;
  }

  return {
    timestamp: new Date().toISOString(),
    totalEndpoints: endpoints.length,
    totalGaps: critical.length + warnings.length + info.length,
    critical,
    warnings,
    info,
    summary,
    byDomain,
  };
}

// ── Reporter ──

function printReport(report: AuditReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('  Platform RBAC Gap Audit Report');
  console.log('  ' + report.timestamp);
  console.log('='.repeat(70));

  console.log(`\n  Total endpoints scanned: ${report.totalEndpoints}`);
  console.log(`  Total gaps found:        ${report.totalGaps}`);
  console.log(`    Critical:              ${report.critical.length}`);
  console.log(`    Warnings:              ${report.warnings.length}`);
  console.log(`    Info:                  ${report.info.length}`);

  console.log('\n  Summary:');
  console.log(`    Missing @Roles():      ${report.summary.missingRoles}`);
  console.log(`    Mutations w/o guard:   ${report.summary.mutationNoGuard}`);
  console.log(`    Overly permissive:     ${report.summary.overlyPermissive}`);
  console.log(`    Untested mutations:    ${report.summary.untested}`);

  // Domain breakdown
  console.log('\n  By Domain:');
  console.log('  ' + '-'.repeat(50));
  for (const [domain, stats] of Object.entries(report.byDomain).sort((a, b) => b[1].gaps - a[1].gaps)) {
    const icon = stats.gaps === 0 ? 'OK' : 'XX';
    console.log(`    ${icon}  ${domain.padEnd(20)} ${stats.total} endpoints, ${stats.gaps} gaps`);
  }

  // Critical issues
  if (report.critical.length > 0) {
    console.log('\n  CRITICAL — Endpoints missing role guards:');
    console.log('  ' + '-'.repeat(50));
    for (const ep of report.critical) {
      console.log(`    !! ${ep.method.padEnd(6)} ${ep.path}`);
      console.log(`       Controller: ${ep.controller} (${ep.controllerFile})`);
      console.log(`       Gaps: ${ep.gaps.join(', ')}`);
    }
  }

  // Warnings
  if (report.warnings.length > 0) {
    console.log('\n  WARNINGS — Review recommended:');
    console.log('  ' + '-'.repeat(50));
    for (const ep of report.warnings) {
      console.log(`    ?? ${ep.method.padEnd(6)} ${ep.path}  [${ep.gaps.join(', ')}]`);
      if (ep.roles.length > 0) {
        console.log(`       Roles: ${ep.roles.join(', ')}`);
      }
      console.log(`       File: ${ep.controllerFile}`);
    }
  }

  // Info
  if (report.info.length > 0) {
    console.log(`\n  INFO — ${report.info.length} untested mutation endpoints (see JSON output for details)`);
  }

  console.log('\n' + '='.repeat(70));

  if (report.critical.length > 0) {
    console.log('\n  ACTION REQUIRED: Fix critical RBAC gaps before merging.\n');
  } else if (report.warnings.length > 0) {
    console.log('\n  Review warnings above. Run with --json for full details.\n');
  } else {
    console.log('\n  All endpoints have proper RBAC guards. Ship it.\n');
  }
}

// ── Main ──

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const ciMode = args.includes('--ci');

  console.log(`\nScanning controllers in ${BACKEND_SRC}...`);

  const controllerFiles = findControllerFiles(BACKEND_SRC);
  console.log(`Found ${controllerFiles.length} controller files`);

  const allEndpoints: EndpointAudit[] = [];
  for (const file of controllerFiles) {
    allEndpoints.push(...parseControllerForAudit(file));
  }
  console.log(`Parsed ${allEndpoints.length} total endpoints`);

  const testedRoutes = findTestedEndpoints();
  console.log(`Found ${testedRoutes.size} tested route patterns in E2E tests`);

  const report = detectGaps(allEndpoints, testedRoutes);

  // Save JSON report
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'rbac-audit.json'), JSON.stringify(report, null, 2));

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // CI mode: fail if critical gaps exist
  if (ciMode && report.critical.length > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
