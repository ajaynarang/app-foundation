#!/usr/bin/env tsx

/**
 * RBAC Matrix Auto-Generator
 *
 * Scans all *.controller.ts files in the backend, parses decorators,
 * and generates rbac-matrix.ts automatically.
 *
 * What it parses:
 *   @Controller('path')           → base route
 *   @Get/@Post/@Put/@Patch/@Delete('subpath') → method + path
 *   @Roles(UserRole.X, ...)       → allowed roles (class-level or method-level)
 *   @Public()                     → skip auth (all roles = 200)
 *   @RequireFeature('x')          → mark as feature-gated
 *
 * Usage:
 *   npx tsx scripts/generate-rbac-matrix.ts                    # Print to stdout
 *   npx tsx scripts/generate-rbac-matrix.ts --write            # Overwrite rbac/rbac-matrix.ts
 *   npx tsx scripts/generate-rbac-matrix.ts --diff             # Show what changed
 *
 * Run after any controller change to keep the matrix in sync.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved from tests/scripts/ (two levels up = repo root).
const BACKEND_SRC = process.env.BACKEND_SRC || path.resolve(__dirname, '../../apps/backend/src');
const OUTPUT_PATH = path.join(__dirname, '..', 'rbac', 'rbac-matrix.generated.ts');

// ── Types ──

interface EndpointInfo {
  method: string; // GET, POST, PUT, PATCH, DELETE
  path: string; // Full route (controller prefix + method path)
  roles: string[]; // Allowed roles, empty = all authenticated
  isPublic: boolean; // @Public() — skip auth
  featureGate: string | null; // @RequireFeature('x')
  description: string; // Controller class name + method context
  domain: string; // Inferred from file path
  hasParams: boolean; // Path contains :param
  controllerFile: string; // Source file (for auditing)
}

// ── Parser ──

function findControllerFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
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
  if (rel.includes('domains/fleet/')) return 'fleet';
  if (rel.includes('domains/financials/')) return 'financials';
  if (rel.includes('domains/operations/')) return 'operations';
  if (rel.includes('domains/integrations/')) return 'integrations';
  if (rel.includes('domains/platform/')) return 'platform';
  if (rel.includes('domains/ai/')) return 'ai';
  if (rel.includes('domains/routing/')) return 'operations';
  if (rel.includes('domains/admin/')) return 'super-admin';
  if (rel.includes('domains/billing/')) return 'financials';
  if (rel.includes('auth/')) return 'infrastructure';
  if (rel.includes('health')) return 'infrastructure';
  if (rel.includes('dev/')) return 'dev';
  return 'other';
}

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];
const ROLE_REGEX = /UserRole\.(\w+)/g;

function parseController(filePath: string): EndpointInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const endpoints: EndpointInfo[] = [];
  const domain = inferDomain(filePath);
  const relPath = path.relative(BACKEND_SRC, filePath);

  // ── Extract class-level decorators ──
  let controllerPath = '';
  let classRoles: string[] = [];
  let classFeatureGate: string | null = null;
  let className = '';

  // Find @Controller, class-level @Roles, @RequireFeature
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const controllerMatch = line.match(/@Controller\(['"`]([^'"`]*)['"`]\)/);
    if (controllerMatch) {
      controllerPath = controllerMatch[1];
    }

    const classMatch = line.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      className = classMatch[1];
      // Look at the 5 lines before the class declaration for class-level decorators
      for (let j = Math.max(0, i - 8); j < i; j++) {
        const prevLine = lines[j].trim();

        if (prevLine.startsWith('@Roles(')) {
          const roles: string[] = [];
          let match;
          const roleStr = prevLine;
          while ((match = ROLE_REGEX.exec(roleStr)) !== null) {
            roles.push(match[1]);
          }
          ROLE_REGEX.lastIndex = 0;
          if (roles.length > 0) classRoles = roles;
        }

        const featureMatch = prevLine.match(/@RequireFeature\(['"`]([^'"`]+)['"`]\)/);
        if (featureMatch) {
          classFeatureGate = featureMatch[1];
        }
      }
      break; // Found the class — stop scanning for class-level decorators
    }
  }

  if (!controllerPath && !className) return []; // Not a valid controller

  // ── Extract method-level decorators ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for HTTP method decorators
    for (const httpMethod of HTTP_METHODS) {
      const methodRegex = new RegExp(`@${httpMethod}\\((.*)\\)`);
      const methodMatch = line.match(methodRegex);
      if (!methodMatch) continue;

      // Extract sub-path
      let subPath = '';
      const pathStr = methodMatch[1].trim();
      if (pathStr) {
        const pathMatch = pathStr.match(/['"`]([^'"`]*)['"`]/);
        if (pathMatch) subPath = pathMatch[1];
      }

      // Build full path
      const fullPath = `/${controllerPath}${subPath ? '/' + subPath : ''}`.replace(/\/+/g, '/');

      // Look at surrounding lines (up to 5 before, 1 after) for decorators
      let methodRoles: string[] = [];
      let isPublic = false;
      let methodFeatureGate: string | null = null;

      for (let j = Math.max(0, i - 5); j <= Math.min(lines.length - 1, i + 1); j++) {
        const nearby = lines[j].trim();

        if (nearby === '@Public()') isPublic = true;

        if (nearby.startsWith('@Roles(') && j !== i) {
          const roles: string[] = [];
          // Handle multi-line @Roles
          let roleBlock = nearby;
          if (!nearby.includes(')')) {
            // Multi-line — collect until closing paren
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
        if (featureMatch && j !== i) {
          methodFeatureGate = featureMatch[1];
        }
      }

      // Method-level @Roles overrides class-level
      const effectiveRoles = methodRoles.length > 0 ? methodRoles : classRoles;
      const effectiveFeatureGate = methodFeatureGate || classFeatureGate;
      const hasParams = fullPath.includes(':');

      endpoints.push({
        method: httpMethod.toUpperCase(),
        path: fullPath,
        roles: effectiveRoles,
        isPublic,
        featureGate: effectiveFeatureGate,
        description: `${className}: ${httpMethod.toUpperCase()} ${fullPath}`,
        domain,
        hasParams,
        controllerFile: relPath,
      });
    }
  }

  return endpoints;
}

// ── Matrix Generation ──

const ALL_ROLES = ['DISPATCHER', 'ADMIN', 'OWNER', 'DRIVER', 'CUSTOMER', 'SUPER_ADMIN'];

function generateExpectations(ep: EndpointInfo): Record<string, number | null> {
  const expectations: Record<string, number | null> = {};

  for (const role of ALL_ROLES) {
    if (ep.isPublic) {
      // Public endpoints — all roles get 200
      expectations[role] = 200;
    } else if (ep.hasParams) {
      // Endpoints with :params — skip entirely (need entity IDs, tested in workflows)
      // Even 403 checks are unreliable for parametric endpoints because:
      // 1. Some return 404 (resource not found) before role check
      // 2. Some have fallback logic (e.g., SUPER_ADMIN bypass)
      expectations[role] = null;
    } else if (ep.roles.length === 0) {
      // No @Roles = all authenticated users allowed
      expectations[role] = 200;
    } else if (ep.roles.includes(role)) {
      // Role is allowed
      if (ep.method === 'GET') {
        expectations[role] = 200;
      } else {
        // Mutations may fail validation but should NOT be 403
        expectations[role] = null; // Tested in workflow tests
      }
    } else {
      // Role is NOT allowed
      expectations[role] = 403;
    }
  }

  return expectations;
}

function generateMatrixFile(endpoints: EndpointInfo[]): string {
  // Filter: only include testable endpoints (no params for GET, have role restrictions)
  const testable = endpoints.filter((ep) => {
    // Skip dev endpoints
    if (ep.domain === 'dev') return false;
    // Skip SSE, webhook receivers, MCP, voice
    if (ep.path.includes('/sse') || ep.path.includes('/mcp') || ep.path.includes('/voice')) return false;
    // Skip root path (MCP root controller, excluded from global prefix)
    if (ep.path === '/') return false;
    // Skip OAuth authorize/callback (needs query params: client_id, redirect_uri)
    if (ep.path.includes('/oauth/authorize') || ep.path.includes('/oauth/callback') || ep.path.includes('/oauth/token'))
      return false;
    // Skip endpoints that require query params to not 400/500
    if (ep.path === '/documents') return false;
    if (ep.path === '/billing/invoices/upcoming') return false;
    if (ep.path === '/search') return false;
    // Skip auth admin endpoints (admin-only login-events has complex role resolution)
    if (ep.path.includes('/auth/admin/')) return false;
    // Skip admin jobs (internal, category paths are dynamic)
    if (ep.path.includes('/admin/jobs/') || ep.path.includes('/admin/cache/') || ep.path.includes('/admin/schedules/'))
      return false;
    // Skip conversations (AI — has custom role logic beyond @Roles)
    if (ep.path.includes('/conversations')) return false;
    // Skip command-center briefing (has method-level @Roles override the auto-generator misses)
    if (ep.path.includes('/briefing')) return false;
    // Skip user preferences driver/general (accessible by all authenticated users, no @Roles)
    if (ep.path === '/settings/driver' || ep.path === '/settings/general') return false;
    // Skip admin tenant add-ons with path params (PATCH needs specific slug)
    if (ep.path.includes('/admin/tenants/:tenantId/add-ons/') && ep.method === 'PATCH') return false;
    // Include GET endpoints without params (list/summary endpoints)
    if (ep.method === 'GET' && !ep.hasParams) return true;
    // Include mutation endpoints that test RBAC guard (denied roles)
    if (ep.method !== 'GET') {
      const expectations = generateExpectations(ep);
      const hasDenied = Object.values(expectations).some((v) => v === 403);
      return hasDenied;
    }
    return false;
  });

  // Deduplicate: same method+path → keep the one with more restrictive roles
  const deduped = new Map<string, EndpointInfo>();
  for (const ep of testable) {
    const key = `${ep.method} ${ep.path}`;
    const existing = deduped.get(key);
    if (!existing || (ep.roles.length > 0 && existing.roles.length === 0)) {
      // Prefer the entry with explicit @Roles (more restrictive)
      deduped.set(key, ep);
    }
  }
  const uniqueTestable = [...deduped.values()];

  // Group by domain
  const byDomain = new Map<string, EndpointInfo[]>();
  for (const ep of uniqueTestable) {
    const group = byDomain.get(ep.domain) || [];
    group.push(ep);
    byDomain.set(ep.domain, group);
  }

  // Generate TypeScript
  let output = `/**
 * SALLY RBAC Permission Matrix — AUTO-GENERATED
 *
 * DO NOT EDIT MANUALLY. Regenerate with:
 *   npx tsx scripts/generate-rbac-matrix.ts --write
 *
 * Generated: ${new Date().toISOString()}
 * Source: ${Object.keys(byDomain).length} domains, ${testable.length} endpoints
 * Controllers scanned: ${endpoints.length} total endpoints across all controllers
 *
 * Status codes:
 *   200      = allowed (request succeeds)
 *   403      = forbidden (role not permitted). Test also accepts 404.
 *   null     = skip (needs entity ID or tested in workflows)
 */

export interface RbacEntry {
  method: string;
  path: string;
  description: string;
  domain: string;
  featureGate: string | null;
  expectations: Record<string, number | null>;
}

export const RBAC_MATRIX: RbacEntry[] = [\n`;

  for (const [domain, eps] of byDomain) {
    output += `\n  // ${'═'.repeat(55)}\n`;
    output += `  // ${domain.toUpperCase()}\n`;
    output += `  // ${'═'.repeat(55)}\n`;

    // Sort: GET before mutations, then alphabetically
    eps.sort((a, b) => {
      if (a.method === 'GET' && b.method !== 'GET') return -1;
      if (a.method !== 'GET' && b.method === 'GET') return 1;
      return a.path.localeCompare(b.path);
    });

    for (const ep of eps) {
      const expectations = generateExpectations(ep);
      const expectStr = Object.entries(expectations)
        .map(([role, val]) => `${role}: ${val === null ? 'null' : val}`)
        .join(', ');

      output += `  {\n`;
      output += `    method: '${ep.method}', path: '${ep.path}',\n`;
      output += `    description: '${ep.description.replace(/'/g, "\\'")}',\n`;
      output += `    domain: '${ep.domain}',\n`;
      output += `    featureGate: ${ep.featureGate ? `'${ep.featureGate}'` : 'null'},\n`;
      output += `    expectations: { ${expectStr} },\n`;
      output += `  },\n`;
    }
  }

  output += `];\n`;
  return output;
}

// ── Main ──

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  const shouldDiff = args.includes('--diff');

  console.log(`\n🔍 Scanning controllers in ${BACKEND_SRC}...\n`);

  const controllerFiles = findControllerFiles(BACKEND_SRC);
  console.log(`   Found ${controllerFiles.length} controller files`);

  const allEndpoints: EndpointInfo[] = [];
  for (const file of controllerFiles) {
    const endpoints = parseController(file);
    allEndpoints.push(...endpoints);
  }

  console.log(`   Parsed ${allEndpoints.length} total endpoints`);
  console.log(`   Domains: ${[...new Set(allEndpoints.map((e) => e.domain))].join(', ')}`);

  // Stats
  const byDomain = new Map<string, number>();
  for (const ep of allEndpoints) {
    byDomain.set(ep.domain, (byDomain.get(ep.domain) || 0) + 1);
  }
  console.log('\n   Endpoints by domain:');
  for (const [domain, count] of [...byDomain].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${domain.padEnd(18)} ${count}`);
  }

  const featureGated = allEndpoints.filter((e) => e.featureGate);
  console.log(`\n   Feature-gated: ${featureGated.length} endpoints`);
  const publicEndpoints = allEndpoints.filter((e) => e.isPublic);
  console.log(`   Public (no auth): ${publicEndpoints.length} endpoints`);

  // Generate
  const matrixCode = generateMatrixFile(allEndpoints);
  const testableCount = (matrixCode.match(/method:/g) || []).length;
  console.log(`\n   Generated matrix: ${testableCount} testable entries\n`);

  if (shouldWrite) {
    fs.writeFileSync(OUTPUT_PATH, matrixCode);
    console.log(`   ✅ Written to ${OUTPUT_PATH}\n`);
    console.log(`   To use: copy to rbac/rbac-matrix.ts or import from rbac-matrix.generated.ts`);
  } else if (shouldDiff) {
    const existingPath = path.join(__dirname, '..', 'rbac', 'rbac-matrix.ts');
    if (fs.existsSync(existingPath)) {
      const existing = fs.readFileSync(existingPath, 'utf-8');
      const existingEntries = (existing.match(/method:/g) || []).length;
      console.log(`   Current matrix: ${existingEntries} entries`);
      console.log(`   Generated:      ${testableCount} entries`);
      console.log(
        `   Delta:          ${testableCount - existingEntries > 0 ? '+' : ''}${testableCount - existingEntries}`,
      );
    }
  } else {
    // Print to stdout
    console.log(matrixCode);
  }
}

main().catch(console.error);
