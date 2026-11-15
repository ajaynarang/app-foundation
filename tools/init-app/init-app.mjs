#!/usr/bin/env node
/**
 * init-app — turn the app-foundation template into YOUR app, in one command.
 *
 *   pnpm init-app --name acme-crm --display-name "Acme CRM" --yes
 *   pnpm init-app            # interactive prompts
 *
 * What it renames (discovered by scanning the repo — see RULES below):
 *   - `app-foundation`            → <name>            (package names, README, CLAUDE.md, landing page)
 *   - `app-backend|frontend`      → <name>-*          (Doppler projects via doppler.yaml + scripts,
 *                                                      OTel/Grafana service names, compose services)
 *   - `app-postgres|redis|minio|loki|tempo|grafana|inngest` → <name>-*  (docker container names; `app-minio-init` follows)
 *   - `__PROJECT__`               → <name>            (Terraform state bucket in infra/)
 *   - terraform var.project default `"app"` → <name>
 *   - postgres db `app` (DATABASE_URL + POSTGRES_DB)  → <db>
 *   - branding string `Platform`  → <display-name>    (targeted files only — web layout
 *                                                      metadata, login, PublicLayout, landing page)
 *   - PROJECT_NAME / MULTI_TENANT / NEXT_PUBLIC_MULTI_TENANT in .env.example files
 *   - `@app/` workspace scope     → <scope>/          (only when --scope is not @app)
 *   - Grafana-as-code PROJECT / REPO_URL → <name> / <repo-url>, then the catalog is regenerated
 *
 * The order inside one run:
 *   1. Optional features, removed through their manifests (apply-feature.mjs) so each is matched against template
 *      text: `--desk no` (the default) with features/desk.json, `--mobile no` with features/mobile.json.
 *   2. The prune step (prune-requires.mjs) reads the disk: every skill, reference, agent and hotspot file that
 *      requires a feature whose folder is now gone is deleted, with the skill-table rows that linked to it.
 *   3. The skill prefix (skill-prefix.mjs): each `app-<x>` skill folder and agent file becomes `<prefix>-<x>`, and
 *      exactly those names are replaced, as whole tokens, in the files the walker visits (not in source code).
 *   4. The rename rules below.
 *   5. `.claude/workflow.json` is written for the product (prefix, reserved names, plans), `--plans tracked` drops the
 *      plans folder from .gitignore, and every `verified:` line leaves the docs (scaffold-text.mjs).
 *
 * `--describe` prints every option as JSON (name, question, choices, default) and changes nothing.
 *
 * Never touched: .git, node_modules, pnpm-lock.yaml (run `pnpm install` after a scope rename),
 * docs/superpowers/ (historical design docs), tools/init-app/ (this tool).
 *
 * Zero dependencies. Node >= 20.
 */

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { execFileSync, execSync } from 'node:child_process';
import { loadManifest, removeFeature } from './apply-feature.mjs';
import { pruneRequires } from './prune-requires.mjs';
import {
  defaultSkillPrefix,
  renameSkills,
  reservedNamesFor,
  skillPrefixProblems,
  workflowSkillNames,
} from './skill-prefix.mjs';
import {
  INIT_OPTIONS,
  clearVerifiedLines,
  normalizeTenancy,
  stripPlansIgnore,
  writeWorkflowConfig,
} from './scaffold-text.mjs';
import { loadWorkflowConfig } from '../guards/workflow-config.mjs';
import {
  CONSTANTS_FILE as OBSERVABILITY_CONSTANTS,
  GENERATE_SCRIPT as OBSERVABILITY_GENERATE,
  isValidRepoUrl,
  repoUrlFromRemote,
  setObservabilityConstants,
} from './observability-constants.mjs';
import { walkRepo } from './repo-walk.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
    tenancy: { type: 'string' }, // multi | single | personal (mt and st still work)
    mobile: { type: 'string' }, // yes | no — keep the Flutter companion app?
    desk: { type: 'string' }, // yes | no — include Desk (default no)?
    'skill-prefix': { type: 'string' }, // <prefix>-<name> for every skill and agent
    plans: { type: 'string' }, // tracked | untracked — plans, specs and test notes in git?
    describe: { type: 'boolean', default: false },
    'repo-url': { type: 'string' }, // https://github.com/<org>/<repo> — runbook links in the alert catalog
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
  --tenancy <multi|single|personal>
                           Tenancy mode written to .env.example files (default: multi; mt and st also work)
  --mobile <yes|no>        Keep the Flutter mobile companion app at apps/mobile (default: yes)
  --desk <yes|no>          Include Desk, the Inngest workflow engine for background AI agents (default: no)
  --skill-prefix <prefix>  Skills and agents become <prefix>-<name>: 2 to 12 lowercase letters or digits
                           (default: the name if one word of at most 8 characters, the initials of several words,
                           else the first three letters)
  --plans <tracked|untracked>  Whether git tracks the plans folder, docs/superpowers (default: tracked)
  --repo-url <url>         Your repository, e.g. https://github.com/acme/acme-crm: alert runbook links point there
                           (default: the git remote origin, unless it is the template's own)
  --yes                    Non-interactive; accept defaults for everything not passed
  --dry-run                Show per-file replacement counts; change nothing
  --force                  Skip the git-clean and already-initialized guards
  --describe               Print every option as JSON (name, question, choices, default) and exit
`);
  process.exit(0);
}

if (flags.describe) {
  const options = INIT_OPTIONS.map(({ name, question, choices, default: def, defaultRule }) => ({
    name,
    question,
    choices,
    default: def,
    ...(defaultRule ? { defaultRule } : {}),
  }));
  console.log(JSON.stringify({ tool: 'init-app', options }, null, 2));
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
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

let TEMPLATE_WORKFLOW;
try {
  TEMPLATE_WORKFLOW = loadWorkflowConfig(ROOT);
} catch (e) {
  fail(e.message);
}

const rootPkgPath = path.join(ROOT, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

if (!flags.force && rootPkg.name !== TEMPLATE_NAME) {
  fail(
    `This repo is already initialized (package name is "${rootPkg.name}", not "${TEMPLATE_NAME}"). Re-run with --force only if you know what you're doing.`,
  );
}

if (!flags.force && !flags['dry-run']) {
  try {
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty)
      fail(
        'Working tree is not clean. Commit or stash first (or pass --force). init-app rewrites many files — you want a clean diff.',
      );
  } catch (e) {
    if (e.message && e.message.includes('not a git repository')) {
      console.warn(
        '  ⚠ Not a git repository — skipping the clean-tree guard. Consider `git init` first so you can review the diff.',
      );
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
    desk: flags.desk,
    skillPrefix: flags['skill-prefix'],
    plans: flags.plans,
    repoUrl: flags['repo-url'],
  };
  // The questions, defaults and choices all come from INIT_OPTIONS, the list `--describe` prints.
  const opt = (name) => INIT_OPTIONS.find((o) => o.name === name);
  const question = (name) => opt(name).question;
  const def = (name) => opt(name).default;
  const choiceHint = (name) => ` (${opt(name).choices.join('/')})`;
  const isChoice = (name, value) => opt(name).choices.includes(value);
  const remoteRepoUrl = detectRepoUrl();

  if (flags.yes) {
    if (!cfg.name) fail('--yes requires --name.');
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q, def) => {
      const a = (await rl.question(`  ${q}${def ? ` [${def}]` : ''}: `)).trim();
      return a || def || '';
    };
    cfg.name = cfg.name || (await ask(question('name')));
    cfg.displayName = cfg.displayName || (await ask(question('display-name'), titleCase(cfg.name || '')));
    cfg.scope = cfg.scope || (await ask(question('scope'), def('scope')));
    cfg.db = cfg.db || (await ask(question('db'), (cfg.name || '').replace(/-/g, '_')));
    cfg.tenancy = cfg.tenancy || (await ask(question('tenancy'), def('tenancy')));
    cfg.mobile = cfg.mobile || (await ask(question('mobile') + choiceHint('mobile'), def('mobile')));
    cfg.desk = cfg.desk || (await ask(question('desk') + choiceHint('desk'), def('desk')));
    cfg.skillPrefix = cfg.skillPrefix || (await ask(question('skill-prefix'), defaultSkillPrefix(cfg.name || '')));
    cfg.plans = cfg.plans || (await ask(question('plans') + choiceHint('plans'), def('plans')));
    cfg.repoUrl = cfg.repoUrl || (await ask(question('repo-url'), remoteRepoUrl ?? ''));
    rl.close();
  }

  cfg.displayName = cfg.displayName || titleCase(cfg.name);
  cfg.scope = cfg.scope || def('scope');
  cfg.db = cfg.db || cfg.name.replace(/-/g, '_');
  cfg.tenancy = cfg.tenancy || def('tenancy');
  cfg.mobile = cfg.mobile || def('mobile');
  cfg.desk = cfg.desk || def('desk');
  cfg.skillPrefix = cfg.skillPrefix || defaultSkillPrefix(cfg.name);
  cfg.plans = cfg.plans || def('plans');
  cfg.repoUrl = cfg.repoUrl || remoteRepoUrl || '';

  if (!VALID.name.test(cfg.name)) fail(`Invalid --name "${cfg.name}" — must match ${VALID.name}`);
  if (cfg.name === TEMPLATE_NAME) fail(`--name cannot be "${TEMPLATE_NAME}" — pick your app's name.`);
  if (!VALID.scope.test(cfg.scope)) fail(`Invalid --scope "${cfg.scope}" — must match ${VALID.scope}`);
  if (!VALID.db.test(cfg.db)) fail(`Invalid --db "${cfg.db}" — must match ${VALID.db}`);
  const tenancy = normalizeTenancy(cfg.tenancy);
  if (!tenancy) fail(`Invalid --tenancy "${cfg.tenancy}" — must be multi, single or personal (or mt, st)`);
  cfg.tenancy = tenancy;
  if (!isChoice('mobile', cfg.mobile))
    fail(`Invalid --mobile "${cfg.mobile}" — must be ${opt('mobile').choices.join(' or ')}`);
  if (!isChoice('desk', cfg.desk)) fail(`Invalid --desk "${cfg.desk}" — must be ${opt('desk').choices.join(' or ')}`);
  if (!isChoice('plans', cfg.plans))
    fail(`Invalid --plans "${cfg.plans}" — must be ${opt('plans').choices.join(' or ')}`);
  cfg.reservedNames = reservedNamesFor(cfg.name, cfg.skillPrefix, TEMPLATE_WORKFLOW.reservedNames);
  const prefixProblems = skillPrefixProblems(
    cfg.skillPrefix,
    [...cfg.reservedNames, ...TEMPLATE_WORKFLOW.reservedNames],
    workflowSkillNames(ROOT, TEMPLATE_WORKFLOW.skillPrefix),
  );
  if (prefixProblems.length) fail(`Invalid --skill-prefix: ${prefixProblems.join('; ')}`);
  if (cfg.repoUrl && !isValidRepoUrl(cfg.repoUrl))
    fail(`Invalid --repo-url "${cfg.repoUrl}" — must look like https://github.com/<org>/<repo>`);
  return cfg;
}

/** The origin remote as a web URL, unless it is the template's own repository (a plain clone of it). */
function detectRepoUrl() {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const url = repoUrlFromRemote(remote);
    return url && !url.includes(TEMPLATE_NAME) ? url : null;
  } catch {
    return null;
  }
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
  'apps/mobile/lib/core/app_config.dart',
];

function buildRules(cfg) {
  const { name, displayName, scope, db, tenancy } = cfg;
  void tenancy;
  const mt = tenancy === 'single' ? 'false' : 'true';
  const mode = tenancy;
  const rules = [
    {
      id: `${TEMPLATE_NAME} → ${name}`,
      apply: (s) => s.replaceAll(TEMPLATE_NAME, name),
    },
    {
      id: `app-{backend,frontend} → ${name}-*`,
      apply: (s) => s.replace(/\bapp-(backend|frontend)\b/g, `${name}-$1`),
    },
    {
      id: `app-{postgres,redis,minio,loki,tempo,grafana,inngest} → ${name}-*`,
      apply: (s) => s.replace(/\bapp-(postgres|redis|minio|loki|tempo|grafana|inngest)\b/g, `${name}-$1`),
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
          .replace(/^MULTI_TENANT=.*$/m, `MULTI_TENANT=${mt}`)
          .replace(/^TENANCY_MODE=.*$/m, `TENANCY_MODE=${mode}`),
    },
    {
      id: `grafana-as-code PROJECT=${name}${cfg.repoUrl ? ' + REPO_URL' : ''}`,
      files: [OBSERVABILITY_CONSTANTS],
      apply: (s) => setObservabilityConstants(s, { project: name, repoUrl: cfg.repoUrl }),
    },
    {
      id: `web .env.example NEXT_PUBLIC_MULTI_TENANT=${mt}`,
      files: ['apps/web/.env.example'],
      apply: (s) =>
        s
          .replace(/^NEXT_PUBLIC_MULTI_TENANT=.*$/m, `NEXT_PUBLIC_MULTI_TENANT=${mt}`)
          .replace(/^NEXT_PUBLIC_TENANCY_MODE=.*$/m, `NEXT_PUBLIC_TENANCY_MODE=${mode}`),
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

console.log(
  `\n  ${dryRun ? 'DRY RUN — ' : ''}Initializing "${cfg.name}" (display: "${cfg.displayName}", scope: ${cfg.scope}, db: ${cfg.db}, tenancy: ${cfg.tenancy}, mobile: ${cfg.mobile}, desk: ${cfg.desk}, skill prefix: ${cfg.skillPrefix}, plans: ${cfg.plans})\n`,
);

// Optional features go first, so every manifest is matched against template text, before any rename. Each one goes
// through its manifest, the same call as `node tools/init-app/apply-feature.mjs --remove <feature>`.
for (const [feature, label] of [
  ['desk', 'Desk'],
  ['mobile', 'the Flutter app'],
]) {
  if (cfg[feature] !== 'no') continue;
  let actions;
  try {
    actions = removeFeature(ROOT, loadManifest(feature), { dryRun });
  } catch (e) {
    fail(`Could not remove ${label}: ${e.message}`);
  }
  console.log(`  ${dryRun ? 'Would remove' : 'Removed'} ${label} (--${feature} no):`);
  for (const a of actions) console.log(`    ${a}`);
  if (actions.length === 0) console.log('    nothing (already removed)');
  console.log('');
}

// The prune step: after the features are removed, and before any rename, so it reads template names.
{
  const absentFeatures = [cfg.desk === 'no' && 'desk', cfg.mobile === 'no' && 'mobile'].filter(Boolean);
  const actions = pruneRequires(ROOT, { dryRun, absentFeatures });
  if (actions.length) {
    console.log(`  ${dryRun ? 'Would prune' : 'Pruned'} files that require a removed feature:`);
    for (const a of actions) console.log(`    ${a}`);
    console.log('');
  }
}

// The skill prefix: after the prune, so the names come from the folders that are left; before the rename rules.
{
  const actions = renameSkills(ROOT, { from: TEMPLATE_WORKFLOW.skillPrefix, to: cfg.skillPrefix, dryRun });
  if (actions.length) {
    console.log(`  Skill prefix ${TEMPLATE_WORKFLOW.skillPrefix}- → ${cfg.skillPrefix}-:`);
    for (const a of actions) console.log(`    ${a}`);
    console.log('');
  }
}

const stats = new Map(rules.map((r) => [r.id, { files: 0, lines: 0 }]));
let touched = 0;

for (const { abs, rel } of walkRepo(ROOT)) {
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

// What the workflow reads that cannot be read from disk, written for the product; then the plans choice and the
// template's verified: shas, which name commits the product's history does not have.
{
  writeWorkflowConfig(
    ROOT,
    { skillPrefix: cfg.skillPrefix, reservedNames: cfg.reservedNames, plansTracked: cfg.plans === 'tracked' },
    { dryRun },
  );
  console.log(
    `\n  ${dryRun ? 'Would write' : 'Wrote'} .claude/workflow.json (skill prefix ${cfg.skillPrefix}, plans ${cfg.plans}).`,
  );
  const gitignore = path.join(ROOT, '.gitignore');
  if (cfg.plans === 'tracked' && fs.existsSync(gitignore)) {
    const before = fs.readFileSync(gitignore, 'utf8');
    const after = stripPlansIgnore(before, TEMPLATE_WORKFLOW.plans.folder);
    if (after !== before) {
      if (!dryRun) fs.writeFileSync(gitignore, after);
      console.log(
        `  ${dryRun ? 'Would stop' : 'Stopped'} ignoring ${TEMPLATE_WORKFLOW.plans.folder}/ (--plans tracked).`,
      );
    }
  }
  const cleared = clearVerifiedLines(ROOT, { dryRun });
  if (cleared.length)
    console.log(`  ${dryRun ? 'Would clear' : 'Cleared'} the template's verified: line in ${cleared.length} doc(s).`);
}

// The alert and dashboard files are generated from the constants just set. generate.mjs is plain Node, so this runs
// before `pnpm install`; if it cannot, the command is printed.
if (!dryRun) {
  const generate = `node ${OBSERVABILITY_GENERATE}`;
  try {
    execFileSync(process.execPath, [OBSERVABILITY_GENERATE], { cwd: ROOT, stdio: 'pipe' });
    console.log('  Regenerated the Grafana-as-code alerting and dashboard files for the new name.');
  } catch {
    console.warn(`  ⚠ Could not regenerate the Grafana-as-code files. Run: ${generate}`);
  }
  if (!cfg.repoUrl)
    console.log(
      `  No repository URL: alert runbook links stay on the placeholder until you set REPO_URL in\n    ${OBSERVABILITY_CONSTANTS} and run ${generate}.`,
    );
}

// The committed OpenAPI documents and the RBAC matrix list every route, so they go stale when a feature is removed.
let regenerated = false;
if (!dryRun && cfg.desk === 'no') {
  const generators = ['pnpm --filter @app/backend openapi:generate', 'pnpm --filter @app/qa generate:rbac'];
  if (
    fs.existsSync(path.join(ROOT, 'node_modules')) &&
    fs.existsSync(path.join(ROOT, 'packages/appshore/platform/dist'))
  ) {
    try {
      for (const cmd of generators) execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
      regenerated = true;
      console.log('  Regenerated apps/backend/openapi.json, public-openapi.json and the RBAC matrix.');
    } catch {
      console.warn('  ⚠ Could not regenerate the OpenAPI documents and the RBAC matrix; run the commands below.');
    }
  }
  if (!regenerated) {
    console.log(
      `  Without Desk the committed OpenAPI documents and RBAC matrix are stale. After installing and building:\n${generators
        .map((c) => `    ${c}`)
        .join('\n')}`,
    );
  }
}

if (!dryRun) {
  console.log(`
  Next steps:
    1. pnpm install                       # refresh the lockfile (required after a scope rename)
       pnpm exec prettier --write .claude docs   # realign any Markdown table the skill rename shifted
    2. Secrets: see docs/doppler.md       # or: cp apps/backend/.env.example apps/backend/.env
                                          #     cp apps/web/.env.example apps/web/.env.local
       Doppler projects to create: ${cfg.name}-backend, ${cfg.name}-frontend
    3. pnpm docker:up
    4. cd apps/backend && pnpm prisma:migrate:deploy && pnpm db:seed
    5. pnpm dev                           # web :3000, backend :8000${
      cfg.mobile === 'yes'
        ? `
    5b. cd apps/mobile && flutter run     # mobile companion (needs a device/simulator)`
        : ''
    }${
      cfg.desk === 'yes'
        ? `
    5c. pnpm inngest:dev                  # Desk: the local workflow dev server`
        : `
    Desk is not included: its tables stay in the schema, empty. tools/init-app/README.md says how to add it later.`
    }
    6. Replace the landing page (apps/web/src/app/page.tsx) with your product's home,
       and update the Documentation link there to your repo.
    7. Review the diff and commit. Keep tools/init-app/ if you plan to pull template updates:
       apply-feature.mjs is how a returning file of a removed feature is removed again.
    8. Your skills are /${cfg.skillPrefix}-<name> (.claude/skills/). Start with /${cfg.skillPrefix}-runway to write the
       product's binding docs and its domain skill.
`);
}
