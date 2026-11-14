// Fixture tests for the Claude Code hooks in .claude/hooks and the settings that wire them. Each case pipes a sample
// hook input (JSON on stdin, as Claude Code sends it) into the hook as a subprocess and asserts the exit code and the
// output shape: exit 2 with a reason on stderr to block, or `hookSpecificOutput.additionalContext` on stdout to
// advise, or nothing at all.
//
// Some cases build a throwaway git repository. They run with git's repository variables cleared (this file may run
// from the pre-push hook, where git exports GIT_DIR) and check that git resolves inside the temp folder, so nothing
// here can write to the real repository (see tools/verify/hook-env-isolation.test.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp } from '../../../tools/guards/skills-guard.mjs';
import { GENERATED, isRealEnvFile, migrationDir } from '../protected-paths.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(HOOKS, '..', '..');
const HOOK = {
  protect: path.join(HOOKS, 'protected-paths.mjs'),
  gate: path.join(HOOKS, 'convention-gate.mjs'),
  drift: path.join(HOOKS, 'drift-reminder.mjs'),
};

// ── a clean environment: no inherited git repository variables, no user or system git config ────────────────────
const GIT_VARS = (() => {
  const r = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' });
  const listed = r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
  return [...new Set([...listed, 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'])];
})();
function cleanEnv(extra = {}) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of GIT_VARS) delete env[k];
  delete env.CLAUDE_PROJECT_DIR;
  return { ...env, ...extra };
}

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hooks-')));
const write = (dir, rel, text = '') => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
function gitIn(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.email=hooks@example.com', '-c', 'user.name=hooks', ...args], {
    encoding: 'utf8',
    env: cleanEnv(),
  });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
/** A git repository in a new temp folder, on `branch`, with `files` committed. Confirms git resolves inside it. */
function repo(files, branch = 'main') {
  const dir = tmp();
  gitIn(dir, 'init', '-q', '-b', branch);
  assert.equal(
    fs.realpathSync(gitIn(dir, 'rev-parse', '--show-toplevel')),
    dir,
    'git must resolve inside the temp repo',
  );
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'fixture');
  return dir;
}

/** Runs a hook with `input` on stdin. `file` (absolute) becomes tool_input.file_path. */
function run(hook, { file, input, env = {}, cwd } = {}) {
  const stdin =
    input !== undefined
      ? input
      : JSON.stringify({
          hook_event_name: hook === HOOK.protect ? 'PreToolUse' : 'PostToolUse',
          tool_name: 'Edit',
          tool_input: { file_path: file, old_string: 'a', new_string: 'b' },
          cwd: cwd ?? os.tmpdir(),
        });
  const r = spawnSync(process.execPath, [hook], {
    input: stdin,
    encoding: 'utf8',
    env: cleanEnv(env),
    cwd: cwd ?? os.tmpdir(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
/** The additionalContext a hook printed, after checking the output shape. */
function contextOf(r, event) {
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, event);
  assert.equal(typeof out.hookSpecificOutput.additionalContext, 'string');
  return out.hookSpecificOutput.additionalContext;
}
const silent = (r) => {
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
};

// ── every hook: input it does not understand never blocks ───────────────────────────────────────────────────────

for (const [name, hook] of Object.entries(HOOK)) {
  test(`${name}: empty, malformed or path-less input exits 0 and prints nothing`, () => {
    for (const input of [
      '',
      'not json',
      '[]',
      '{}',
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
    ])
      silent(run(hook, { input }));
  });
}

// ── protected paths ──────────────────────────────────────────────────────────────────────────────────────────────

test('protected-paths: a generated file is blocked with the command that regenerates it', () => {
  const dir = tmp();
  for (const rel of [
    'packages/shared-types/src/generated/prisma-enums.ts',
    'packages/appshore/db/generated/client/index.d.ts',
    'apps/backend/openapi.json',
    'apps/backend/public-openapi.json',
    'infra/observability/grafana-cloud/alerting/rules.yaml',
  ]) {
    const r = run(HOOK.protect, { file: path.join(dir, rel), env: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 2, rel);
    assert.match(r.stderr, /generated/);
    assert.match(r.stderr, /Regenerate it/);
  }
});

test('protected-paths: a real env file is blocked; .env.example and ordinary files are allowed silently', () => {
  const dir = tmp();
  for (const rel of ['.env', 'apps/backend/.env', 'apps/web/.env.local', 'apps/backend/.env.production']) {
    const r = run(HOOK.protect, { file: path.join(dir, rel), env: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 2, rel);
    assert.match(r.stderr, /real env file/);
  }
  for (const rel of [
    'apps/backend/.env.example',
    'apps/web/.env.local.example',
    'apps/backend/src/main.ts',
    'README.md',
  ])
    silent(run(HOOK.protect, { file: path.join(dir, rel), env: { CLAUDE_PROJECT_DIR: dir } }));
});

const MIGRATION = 'packages/appshore/db/prisma/migrations/20260101000000_init/migration.sql';

test('protected-paths: a migration folder already on the default branch is blocked', () => {
  const dir = repo({ [MIGRATION]: 'CREATE TABLE a ();\n' });
  const r = run(HOOK.protect, { file: path.join(dir, MIGRATION) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /already on main/);
  // a new file inside the applied folder is blocked too
  assert.equal(run(HOOK.protect, { file: path.join(dir, path.dirname(MIGRATION), 'extra.sql') }).status, 2);
});

test('protected-paths: a new migration folder is allowed silently', () => {
  const dir = repo({ [MIGRATION]: 'CREATE TABLE a ();\n' });
  silent(
    run(HOOK.protect, {
      file: path.join(dir, 'packages/appshore/db/prisma/migrations/20260202000000_next/migration.sql'),
    }),
  );
});

test('protected-paths: origin/<default> counts, and the branch name comes from .claude/workflow.json', () => {
  const dir = repo({ [MIGRATION]: 'x\n', '.claude/workflow.json': JSON.stringify({ defaultBranch: 'trunk' }) }, 'work');
  // no trunk and no origin/trunk yet: allowed, with the one-line note
  const note = contextOf(run(HOOK.protect, { file: path.join(dir, MIGRATION) }), 'PreToolUse');
  assert.match(note, /neither origin\/trunk nor trunk exists/);
  gitIn(dir, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  const r = run(HOOK.protect, { file: path.join(dir, MIGRATION) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /already on origin\/trunk/);
});

test('protected-paths: with no git, a migration edit is allowed with one line saying so', () => {
  const dir = tmp();
  write(dir, MIGRATION, 'x\n');
  const note = contextOf(
    run(HOOK.protect, { file: path.join(dir, MIGRATION), env: { CLAUDE_PROJECT_DIR: dir } }),
    'PreToolUse',
  );
  assert.match(note, /no git here/);
  assert.equal(note.split('\n').length, 1);
});

test("protected-paths: the root is the edited file's own checkout, even when GIT_DIR points elsewhere", () => {
  const dir = repo({ [MIGRATION]: 'x\n' });
  const other = repo({ 'README.md': 'other\n' });
  const r = run(HOOK.protect, {
    file: path.join(dir, MIGRATION),
    env: { GIT_DIR: path.join(other, '.git'), CLAUDE_PROJECT_DIR: other },
    cwd: other,
  });
  assert.equal(r.status, 2, r.stderr);
});

test('protected-paths: the path helpers', () => {
  assert.equal(migrationDir(MIGRATION), 'packages/appshore/db/prisma/migrations/20260101000000_init');
  assert.equal(migrationDir('packages/appshore/db/prisma/migrations/migration_lock.toml'), null);
  assert.ok(isRealEnvFile('.env') && isRealEnvFile('a/.env.staging'));
  assert.ok(!isRealEnvFile('a/.env.example') && !isRealEnvFile('a/env.ts') && !isRealEnvFile('a/.envrc'));
});

test('protected-paths: every generated glob names files that exist in this repository or that git ignores', () => {
  const tracked = spawnSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', env: cleanEnv() });
  const files = tracked.status === 0 ? tracked.stdout.split('\n') : [];
  for (const { glob } of GENERATED) {
    const re = globToRegExp(glob);
    const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').includes(glob.replace(/\/\*\*$/, '/'));
    assert.ok(ignored || files.some((f) => re.test(f)) || tracked.status !== 0, `${glob} matches no tracked file`);
  }
});

// ── convention gate ──────────────────────────────────────────────────────────────────────────────────────────────

const SERVICE = 'apps/backend/src/domains/x/x.service.ts';
const ERR = "export class X { f() { throw new Error('x'); } }\n";

test('convention-gate: a new hit is reported to Claude as additionalContext, naming the rule', () => {
  const dir = repo({ 'README.md': 'x\n' });
  write(dir, SERVICE, ERR);
  const ctx = contextOf(run(HOOK.gate, { file: path.join(dir, SERVICE) }), 'PostToolUse');
  assert.match(ctx, /convention-gate: apps\/backend\/src\/domains\/x\/x\.service\.ts/);
  assert.match(ctx, /\[http-plain-error\]/);
});

test('convention-gate: a clean file, and a hit the baseline allows, print nothing', () => {
  const dir = tmp();
  write(dir, 'apps/backend/src/domains/x/clean.service.ts', 'export const ok = 1;\n');
  silent(
    run(HOOK.gate, {
      file: path.join(dir, 'apps/backend/src/domains/x/clean.service.ts'),
      env: { CLAUDE_PROJECT_DIR: dir },
    }),
  );
  write(dir, SERVICE, ERR);
  write(
    dir,
    'tools/guards/convention-gate.baseline.json',
    JSON.stringify({ entries: { [SERVICE]: { 'http-plain-error': 1 } } }),
  );
  silent(run(HOOK.gate, { file: path.join(dir, SERVICE), env: { CLAUDE_PROJECT_DIR: dir } }));
  write(dir, SERVICE, ERR + ERR);
  assert.match(
    contextOf(run(HOOK.gate, { file: path.join(dir, SERVICE), env: { CLAUDE_PROJECT_DIR: dir } }), 'PostToolUse'),
    /2 here, the baseline allows 1/,
  );
});

test('convention-gate: with no git it uses $CLAUDE_PROJECT_DIR, then cwd; a file outside the root is ignored', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR);
  assert.match(
    contextOf(run(HOOK.gate, { file: path.join(dir, SERVICE), env: { CLAUDE_PROJECT_DIR: dir } }), 'PostToolUse'),
    /http-plain-error/,
  );
  assert.match(
    contextOf(run(HOOK.gate, { file: path.join(dir, SERVICE), cwd: dir }), 'PostToolUse'),
    /http-plain-error/,
  );
  const outside = tmp();
  write(outside, SERVICE, ERR);
  silent(run(HOOK.gate, { file: path.join(outside, SERVICE), env: { CLAUDE_PROJECT_DIR: dir }, cwd: dir }));
});

// ── drift reminder ───────────────────────────────────────────────────────────────────────────────────────────────

/** A temp tree carrying this repository's real hotspot files. */
function withHotspots() {
  const dir = tmp();
  fs.cpSync(path.join(HOOKS, 'hotspots'), path.join(dir, '.claude/hooks/hotspots'), { recursive: true });
  return dir;
}

test('drift-reminder: a schema edit names its follow-ups and the docs that exist, and only those', () => {
  const dir = withHotspots();
  write(dir, 'docs/domain-map.md', '# Domain map\n');
  const schema = 'packages/appshore/db/prisma/schema/app.prisma';
  write(dir, schema, 'model A { id Int @id }\n');
  const ctx = contextOf(
    run(HOOK.drift, { file: path.join(dir, schema), env: { CLAUDE_PROJECT_DIR: dir } }),
    'PostToolUse',
  );
  assert.match(ctx, /^drift-reminder: packages\/appshore\/db\/prisma\/schema\/app\.prisma/);
  assert.match(ctx, /prisma:generate/);
  assert.match(ctx, /Check: docs\/domain-map\.md\./);
  assert.doesNotMatch(ctx, /lifecycles-and-invariants/);
});

test('drift-reminder: a workflow edit states the manual-only rule', () => {
  const dir = withHotspots();
  write(dir, '.github/workflows/ci.yml', 'on: workflow_dispatch\n');
  assert.match(
    contextOf(
      run(HOOK.drift, { file: path.join(dir, '.github/workflows/ci.yml'), env: { CLAUDE_PROJECT_DIR: dir } }),
      'PostToolUse',
    ),
    /CI is manual-only/,
  );
});

test('drift-reminder: a skill or doc whose sources: name the file is named for a re-read', () => {
  const dir = withHotspots();
  write(dir, 'apps/backend/src/domains/x/x.helper.ts', 'export const Foo = 1;\n');
  write(
    dir,
    '.claude/skills/fx-conventions/references/x.md',
    '---\nowner: foundation\nsources:\n  - apps/backend/src/domains/x/x.helper.ts#Foo\n---\n# X\n',
  );
  write(dir, 'docs/x.md', '---\nsources: [apps/backend/src/domains/*/x.helper.ts]\n---\n# X\n');
  write(dir, 'docs/unrelated.md', '---\nsources: [apps/web/src/a.ts]\n---\n# Y\n');
  const ctx = contextOf(
    run(HOOK.drift, {
      file: path.join(dir, 'apps/backend/src/domains/x/x.helper.ts'),
      env: { CLAUDE_PROJECT_DIR: dir },
    }),
    'PostToolUse',
  );
  assert.match(ctx, /\.claude\/skills\/fx-conventions\/references\/x\.md, docs\/x\.md describe this file/);
  assert.doesNotMatch(ctx, /unrelated/);
});

test('drift-reminder: a folder in sources: does not name the doc for every edit inside that folder', () => {
  const dir = withHotspots();
  write(dir, 'packages/lib/src/deep/a.ts', 'export {};\n');
  write(dir, 'packages/lib/src/index.ts', 'export {};\n');
  write(
    dir,
    'docs/map.md',
    '---\nsources:\n  - packages/lib\n  - packages/lib/src/\n  - packages/lib/src/index.ts\n---\n# Map\n',
  );
  silent(run(HOOK.drift, { file: path.join(dir, 'packages/lib/src/deep/a.ts'), env: { CLAUDE_PROJECT_DIR: dir } }));
  assert.match(
    contextOf(
      run(HOOK.drift, { file: path.join(dir, 'packages/lib/src/index.ts'), env: { CLAUDE_PROJECT_DIR: dir } }),
      'PostToolUse',
    ),
    /docs\/map\.md describes this file/,
  );
});

test('drift-reminder: an edit no hotspot or source names prints nothing, with or without git', () => {
  const dir = withHotspots();
  write(dir, 'README.md', 'x\n');
  silent(run(HOOK.drift, { file: path.join(dir, 'README.md'), env: { CLAUDE_PROJECT_DIR: dir } }));
  const g = repo({ 'README.md': 'x\n' });
  silent(run(HOOK.drift, { file: path.join(g, 'README.md') }));
});

test('drift-reminder: a product hotspot file is read beside the foundation one', () => {
  const dir = withHotspots();
  write(
    dir,
    '.claude/hooks/hotspots/product.json',
    JSON.stringify({ hotspots: [{ paths: ['apps/backend/src/domains/orders/**'], say: 'Orders changed.' }] }),
  );
  write(dir, 'apps/backend/src/domains/orders/orders.helper.ts', 'export {};\n');
  assert.match(
    contextOf(
      run(HOOK.drift, {
        file: path.join(dir, 'apps/backend/src/domains/orders/orders.helper.ts'),
        env: { CLAUDE_PROJECT_DIR: dir },
      }),
      'PostToolUse',
    ),
    /Orders changed\./,
  );
});

// ── settings.json ────────────────────────────────────────────────────────────────────────────────────────────────

const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));

test('settings.json wires each hook through $CLAUDE_PROJECT_DIR on Edit and Write, and each script exists', () => {
  const commands = (event) =>
    (settings.hooks?.[event] ?? []).flatMap((m) => {
      assert.match(m.matcher, /\bEdit\b/);
      assert.match(m.matcher, /\bWrite\b/);
      return m.hooks.map((h) => h.command);
    });
  const pre = commands('PreToolUse');
  const post = commands('PostToolUse');
  assert.deepEqual(
    pre.map((c) => path.basename(c.match(/\/([^/"]+\.mjs)/)[1])),
    ['protected-paths.mjs'],
  );
  assert.deepEqual(
    post.map((c) => path.basename(c.match(/\/([^/"]+\.mjs)/)[1])),
    ['convention-gate.mjs', 'drift-reminder.mjs'],
  );
  for (const c of [...pre, ...post]) {
    assert.match(c, /^node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/[a-z-]+\.mjs"$/);
    assert.ok(fs.existsSync(path.join(ROOT, c.match(/\$CLAUDE_PROJECT_DIR\/([^"]+)"/)[1])));
  }
});

test('settings.json denies reading real env and key files, and leaves .env.example readable', () => {
  const deny = (settings.permissions?.deny ?? [])
    .map((p) => p.match(/^Read\((.+)\)$/)?.[1])
    .filter(Boolean)
    .map((g) => globToRegExp(g));
  const denied = (rel) => deny.some((re) => re.test(rel));
  for (const rel of [
    '.env',
    'apps/backend/.env',
    'apps/web/.env.local',
    'apps/backend/.env.production',
    'keys/app.p12',
    'x/server.pem',
  ])
    assert.ok(denied(rel), `${rel} should be denied`);
  for (const rel of ['apps/backend/.env.example', 'apps/web/.env.example', 'apps/backend/src/config/configuration.ts'])
    assert.ok(!denied(rel), `${rel} should stay readable`);
});

// The env names the protected-paths hook blocks from editing must also be denied for reading. A deny rule cannot
// exempt .env.example, so settings.json lists names one by one; a name added here needs a line there.
const COMMON_ENV_NAMES = [
  '.env',
  '.env.local',
  '.env.dev',
  '.env.dev.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  '.env.ci',
  '.env.qa',
  '.env.uat',
  '.env.preview',
  '.env.preview.local',
  '.env.staging',
  '.env.staging.local',
  '.env.prod',
  '.env.prod.local',
  '.env.production',
  '.env.production.local',
];

test('settings.json denies reading every common env name the protected-paths hook treats as real', () => {
  const deny = (settings.permissions?.deny ?? [])
    .map((p) => p.match(/^Read\((.+)\)$/)?.[1])
    .filter(Boolean)
    .map((g) => globToRegExp(g));
  for (const name of COMMON_ENV_NAMES) {
    const rel = `apps/backend/${name}`;
    assert.ok(isRealEnvFile(rel), `${name} is a real env file to the hook`);
    assert.ok(
      deny.some((re) => re.test(rel)),
      `${name} is blocked from editing, so reading it is denied too`,
    );
  }
});

test('settings.json declares the superpowers plugin and its marketplace', () => {
  const [plugin] = Object.keys(settings.enabledPlugins ?? {}).filter((k) => k.startsWith('superpowers@'));
  assert.ok(plugin, 'superpowers is enabled');
  assert.ok(settings.extraKnownMarketplaces?.[plugin.split('@')[1]], 'its marketplace is declared');
});
