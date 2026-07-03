#!/usr/bin/env node
/**
 * init-app — turn the app-foundation template into YOUR app, in one command.
 *
 *   pnpm init-app --name acme-crm --display-name "Acme CRM" --yes
 *   pnpm init-app            # interactive prompts
 *
 * What it renames (discovered by scanning the repo — see RULES below):
 *   - `app-foundation`            → <name>            (package names, README, CLAUDE.md, landing page)
 *   - `app-backend|frontend|console` → <name>-*       (Doppler projects via doppler.yaml + scripts,
 *                                                      OTel/Grafana service names, compose services)
 *   - `app-postgres|redis|loki|tempo|grafana|inngest` → <name>-*  (docker container names)
 *   - `__PROJECT__`               → <name>            (Terraform state bucket in infra/)
 *   - terraform var.project default `"app"` → <name>
 *   - postgres db `app` (DATABASE_URL + POSTGRES_DB)  → <db>
 *   - branding string `Platform`  → <display-name>    (targeted files only — web/console layout
 *                                                      metadata, login, PublicLayout, landing page)
 *   - PROJECT_NAME / MULTI_TENANT / NEXT_PUBLIC_MULTI_TENANT in .env.example files
 *   - `@app/` workspace scope     → <scope>/          (only when --scope is not @app)
 *
 * Never touched: .git, node_modules, pnpm-lock.yaml (run `pnpm install` after a scope rename),
 * docs/superpowers/ (historical design docs), tools/init-app/ (this tool).
 *
 * Zero dependencies. Node >= 20.
 */

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const TEMPLATE_NAME = ['app', 'foundation'].join('-'); // split so this file survives its own rename

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: flags } = parseArgs({
  options: {
    name: { type: 'string' },
    'display-name': { type: 'string' },
    scope: { type: 'string' },
    db: { type: 'string' },
    tenancy: { type: 'string' }, // mt | st
    mobile: { type: 'string' }, // yes | no — keep the Flutter companion app?
    yes: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (flags.help) {
  console.log(`Usage: pnpm init-app [flags]

  --name <kebab-case>      App slug, e.g. acme-crm (required with --yes)
  --display-name <string>  Human name, e.g. "Acme CRM" (default: title-cased name)
  --scope <@scope>         Workspace package scope (default: @app — keeping it is safest)
  --db <snake_case>        Postgres database name (default: name with dashes as underscores)
  --tenancy <mt|st>        Default tenancy mode written to .env.example files (default: mt)
  --mobile <yes|no>        Keep the Flutter mobile companion app at apps/mobile (default: yes)
  --yes                    Non-interactive; accept defaults for everything not passed
  --dry-run                Show per-file replacement counts; change nothing
  --force                  Skip the git-clean and already-initialized guards
`);
  process.exit(0);
}

const VALID = {
  name: /^[a-z][a-z0-9-]*$/,
  scope: /^@[a-z0-9-]+$/,
  db: /^[a-z][a-z0-9_]*$/,
};

function fail(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function titleCase(kebab) {
  return kebab.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const rootPkgPath = path.join(ROOT, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

if (!flags.force && rootPkg.name !== TEMPLATE_NAME) {
  fail(`This repo is already initialized (package name is "${rootPkg.name}", not "${TEMPLATE_NAME}"). Re-run with --force only if you know what you're doing.`);
}

if (!flags.force && !flags['dry-run']) {
  try {
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) fail('Working tree is not clean. Commit or stash first (or pass --force). init-app rewrites many files — you want a clean diff.');
  } catch (e) {
    if (e.message && e.message.includes('not a git repository')) {
      console.warn('  ⚠ Not a git repository — skipping the clean-tree guard. Consider `git init` first so you can review the diff.');
    } else if (!e.message?.includes('Working tree')) {
      console.warn('  ⚠ Could not run git — skipping the clean-tree guard.');
    } else {
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Gather inputs
// ---------------------------------------------------------------------------

async function gatherConfig() {
  const cfg = {
    name: flags.name,
    displayName: flags['display-name'],
    scope: flags.scope,
    db: flags.db,
    tenancy: flags.tenancy,
    mobile: flags.mobile,
  };

  if (flags.yes) {
    if (!cfg.name) fail('--yes requires --name.');
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q, def) => {
      const a = (await rl.question(`  ${q}${def ? ` [${def}]` : ''}: `)).trim();
      return a || def || '';
    };
    cfg.name = cfg.name || (await ask('App name (kebab-case slug, e.g. acme-crm)'));
    cfg.displayName = cfg.displayName || (await ask('Display name', titleCase(cfg.name || '')));
    cfg.scope = cfg.scope || (await ask('Package scope (keep @app unless you have a reason)', '@app'));
    cfg.db = cfg.db || (await ask('Postgres database name', (cfg.name || '').replace(/-/g, '_')));
    cfg.tenancy = cfg.tenancy || (await ask('Tenancy mode — mt (multi-tenant) or st (single-tenant)', 'mt'));
    cfg.mobile = cfg.mobile || (await ask('Include the Flutter mobile companion app? (yes/no)', 'yes'));
    rl.close();
  }

  cfg.displayName = cfg.displayName || titleCase(cfg.name);
  cfg.scope = cfg.scope || '@app';
  cfg.db = cfg.db || cfg.name.replace(/-/g, '_');
  cfg.tenancy = cfg.tenancy || 'mt';
  cfg.mobile = cfg.mobile || 'yes';

  if (!VALID.name.test(cfg.name)) fail(`Invalid --name "${cfg.name}" — must match ${VALID.name}`);
  if (cfg.name === TEMPLATE_NAME) fail(`--name cannot be "${TEMPLATE_NAME}" — pick your app's name.`);
  if (!VALID.scope.test(cfg.scope)) fail(`Invalid --scope "${cfg.scope}" — must match ${VALID.scope}`);
  if (!VALID.db.test(cfg.db)) fail(`Invalid --db "${cfg.db}" — must match ${VALID.db}`);
  if (!['mt', 'st'].includes(cfg.tenancy)) fail(`Invalid --tenancy "${cfg.tenancy}" — must be mt or st`);
  if (!['yes', 'no'].includes(cfg.mobile)) fail(`Invalid --mobile "${cfg.mobile}" — must be yes or no`);
  return cfg;
}

// ---------------------------------------------------------------------------
// Replacement rules
// ---------------------------------------------------------------------------

// Branding sites where the literal display name "Platform" lives. Deliberately
// NOT repo-wide: 'Platform' is also a backend EventCategory and a dev-tool
// label, which must not be renamed.
const BRANDING_FILES = [
  'apps/web/src/app/layout.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/features/auth/components/login-form.tsx',
  'apps/web/src/shared/components/layout/PublicLayout.tsx',
  'apps/console/src/app/layout.tsx',
  'apps/mobile/lib/core/app_config.dart',
];

function buildRules(cfg) {
  const { name, displayName, scope, db, tenancy } = cfg;
  void tenancy;
  const mt = tenancy === 'mt' ? 'true' : 'false';
  const rules = [
    {
      id: `${TEMPLATE_NAME} → ${name}`,
      apply: (s) => s.replaceAll(TEMPLATE_NAME, name),
    },
    {
      id: `app-{backend,frontend,console} → ${name}-*`,
      apply: (s) => s.replace(/\bapp-(backend|frontend|console)\b/g, `${name}-$1`),
    },
    {
      id: `app-{postgres,redis,loki,tempo,grafana,inngest} → ${name}-*`,
      apply: (s) => s.replace(/\bapp-(postgres|redis|loki|tempo|grafana|inngest)\b/g, `${name}-$1`),
    },
    {
      id: `__PROJECT__ → ${name}`,
      apply: (s) => s.replaceAll('__PROJECT__', name),
    },
    {
      id: `postgres db "app" → ${db}`,
      apply: (s) =>
        s
          .replace(/(postgres(?:ql)?:\/\/[^\s'"]*\/)app(\?|['"\s])/g, `$1${db}$2`)
          .replace(/(POSTGRES_DB:\s*)app\b/g, `$1${db}`),
    },
    {
      id: `terraform var.project "app" → ${name}`,
      files: ['infra/terraform/variables.tf'],
      apply: (s) => s.replace(/(variable "project" \{[\s\S]*?default\s*=\s*)"app"/, `$1"${name}"`),
    },
    {
      id: `branding "Platform" → "${displayName}"`,
      files: BRANDING_FILES,
      apply: (s) => s.replace(/\bPlatform\b/g, displayName),
    },
    {
      id: `backend .env.example PROJECT_NAME + MULTI_TENANT=${mt}`,
      files: ['apps/backend/.env.example'],
      apply: (s) =>
        s
          .replace(/^PROJECT_NAME=.*$/m, `PROJECT_NAME=${displayName} Backend`)
          .replace(/^MULTI_TENANT=.*$/m, `MULTI_TENANT=${mt}`),
    },
    {
      id: `web .env.example NEXT_PUBLIC_MULTI_TENANT=${mt}`,
      files: ['apps/web/.env.example'],
      apply: (s) => s.replace(/^NEXT_PUBLIC_MULTI_TENANT=.*$/m, `NEXT_PUBLIC_MULTI_TENANT=${mt}`),
    },
  ];
  if (cfg.mobile === 'yes') {
    const snake = name.replace(/-/g, '_');
    rules.push({
      id: `flutter app_mobile → ${snake}_mobile`,
      apply: (s, rel) => (rel.startsWith('apps/mobile') ? s.replaceAll('app_mobile', `${snake}_mobile`) : s),
    });
  }
  if (scope !== '@app') {
    rules.push({
      id: `@app/ scope → ${scope}/`,
      apply: (s) => s.replaceAll('@app/', `${scope}/`),
    });
  }
  return rules;
}

// ---------------------------------------------------------------------------
// File walk
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', '.turbo', '.next', 'dist', 'build', 'coverage', '.screenshots', '.dart_tool', 'ephemeral', '.gradle', 'generated']);
const SKIP_REL = ['docs/superpowers', 'tools/init-app'];
const SKIP_FILES = new Set(['pnpm-lock.yaml']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.gz', '.tar', '.mp4', '.mov', '.dump', '.jar']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_REL.some((p) => rel === p || rel.startsWith(p + path.sep))) continue;
      yield* walk(abs);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (BINARY_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      if (SKIP_REL.some((p) => rel.startsWith(p + path.sep))) continue;
      yield { abs, rel };
    }
  }
}

function countDiffs(before, after) {
  if (before === after) return 0;
  // cheap proxy: number of changed lines
  const a = before.split('\n');
  const b = after.split('\n');
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const cfg = await gatherConfig();
const rules = buildRules(cfg);
const dryRun = flags['dry-run'];

console.log(`\n  ${dryRun ? 'DRY RUN — ' : ''}Initializing "${cfg.name}" (display: "${cfg.displayName}", scope: ${cfg.scope}, db: ${cfg.db}, tenancy: ${cfg.tenancy})\n`);

const stats = new Map(rules.map((r) => [r.id, { files: 0, lines: 0 }]));
let touched = 0;

for (const { abs, rel } of walk(ROOT)) {
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    continue; // unreadable — skip
  }
  if (content.includes('\0')) continue; // binary masquerading as text

  let updated = content;
  for (const rule of rules) {
    if (rule.files && !rule.files.includes(rel)) continue;
    const next = rule.apply(updated, rel);
    if (next !== updated) {
      const s = stats.get(rule.id);
      s.files += 1;
      s.lines += countDiffs(updated, next);
      updated = next;
    }
  }
  if (updated !== content) {
    touched += 1;
    if (!dryRun) fs.writeFileSync(abs, updated);
  }
}

console.log('  Replacements:');
for (const [id, s] of stats) {
  console.log(`    ${s.files > 0 ? '✔' : '·'} ${id.padEnd(58)} ${s.files} file(s), ~${s.lines} line(s)`);
}
console.log(`\n  ${dryRun ? 'Would touch' : 'Touched'} ${touched} file(s).`);

if (cfg.mobile === 'no') {
  const mobileDir = path.join(ROOT, 'apps', 'mobile');
  if (fs.existsSync(mobileDir)) {
    if (dryRun) {
      console.log('  Would delete apps/mobile (--mobile no).');
    } else {
      fs.rmSync(mobileDir, { recursive: true, force: true });
      console.log('  Deleted apps/mobile (--mobile no).');
    }
  }
}

if (!dryRun) {
  console.log(`
  Next steps:
    1. pnpm install                       # refresh the lockfile (required after a scope rename)
    2. Secrets: see docs/doppler.md       # or: cp apps/backend/.env.example apps/backend/.env
                                          #     cp apps/web/.env.example apps/web/.env.local
       Doppler projects to create: ${cfg.name}-backend, ${cfg.name}-frontend, ${cfg.name}-console
    3. pnpm docker:up
    4. cd apps/backend && pnpm prisma:migrate:deploy && pnpm db:seed
    5. pnpm dev                           # web :3000, backend :8000${cfg.mobile === 'yes' ? `
    5b. cd apps/mobile && flutter run     # mobile companion (needs a device/simulator)` : ''}
    6. Replace the landing page (apps/web/src/app/page.tsx) with your product's home,
       and update the Documentation link there to your repo.
    7. Review the diff, commit, and optionally delete tools/init-app/.
`);
}
