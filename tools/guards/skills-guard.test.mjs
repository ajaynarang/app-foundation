// Tests for tools/guards/skills-guard.mjs. The fixture repo (fixtures/repo) passes every check; each test copies it to
// a temp folder, breaks one thing and asserts the one rule that catches it. The fixture carries its own prefix (`fx`)
// and workflow.json, so it still passes after init-app renames the template. Nothing here touches git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepo, FEATURE_FOLDERS } from './skills-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'repo');
const ROOT = path.resolve(HERE, '..', '..');

function copy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-guard-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const edit = (dir, rel, from, to) => {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `fixture ${rel} no longer contains: ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
};
const rulesOf = (dir, targets) => checkRepo(dir, { targets }).map((f) => `${f.file}:${f.rule}`);
const INDEX = '.claude/skills/fx-conventions/SKILL.md';
const REF = '.claude/skills/fx-conventions/references/api.md';
const LEGACY = '.claude/skills/legacy/SKILL.md';

test('the fixture repo passes every target', () => {
  assert.deepEqual(rulesOf(copy()), []);
});

test('the repository itself passes every target', () => {
  assert.deepEqual(
    checkRepo(ROOT).map((f) => `${f.file}:${f.line} [${f.rule}] ${f.message}`),
    [],
  );
});

// ── skills target: always-on checks ──────────────────────────────────────────

test('a skill whose name differs from its folder fails', () => {
  const dir = copy();
  edit(dir, LEGACY, 'name: legacy', 'name: older');
  assert.ok(rulesOf(dir, ['skills']).includes(`${LEGACY}:name-folder`));
});

test('a skill folder without SKILL.md fails', () => {
  const dir = copy();
  write(dir, '.claude/skills/empty/notes.md', '# Notes\n');
  assert.ok(rulesOf(dir, ['skills']).includes('.claude/skills/empty:name-folder'));
});

test('a skill with the new frontmatter must carry the prefix', () => {
  const dir = copy();
  fs.renameSync(path.join(dir, '.claude/skills/fx-conventions'), path.join(dir, '.claude/skills/conventions'));
  edit(dir, '.claude/skills/conventions/SKILL.md', 'name: fx-conventions', 'name: conventions');
  assert.ok(rulesOf(dir, ['skills']).includes('.claude/skills/conventions/SKILL.md:name-prefix'));
});

test('a skill or agent name that starts with a reserved name fails', () => {
  const dir = copy();
  fs.renameSync(path.join(dir, '.claude/agents/fx-explorer.md'), path.join(dir, '.claude/agents/fx-backend-helper.md'));
  edit(dir, '.claude/agents/fx-backend-helper.md', 'name: fx-explorer', 'name: fx-backend-helper');
  edit(dir, INDEX, '`/fx-explorer`', '`/fx-backend-helper`');
  assert.ok(rulesOf(dir, ['skills']).includes('.claude/agents/fx-backend-helper.md:name-reserved'));
});

test('an agent whose name differs from its file fails', () => {
  const dir = copy();
  edit(dir, '.claude/agents/fx-explorer.md', 'name: fx-explorer', 'name: fx-finder');
  assert.ok(rulesOf(dir, ['skills']).includes('.claude/agents/fx-explorer.md:name-folder'));
});

test('a relative link that does not resolve fails', () => {
  const dir = copy();
  edit(dir, INDEX, '(references/api.md)', '(references/gone.md)');
  assert.ok(rulesOf(dir, ['skills']).includes(`${INDEX}:link`));
});

test('a backticked repo path that does not exist fails, and a glob must match a file', () => {
  const dir = copy();
  edit(dir, LEGACY, '`tools/hook.mjs`', '`tools/gone.mjs` and `apps/api/src/*.dart`');
  const found = rulesOf(dir, ['skills']).filter((r) => r === `${LEGACY}:path`);
  assert.equal(found.length, 2);
});

test('placeholders and paths under an untracked plans folder are skipped', () => {
  const dir = copy();
  edit(dir, LEGACY, '`tools/hook.mjs`', '`tools/hook.mjs`, `apps/<your-app>/src/x.ts`, `docs/plans/2026-01-01-x.md`');
  assert.deepEqual(rulesOf(dir, ['skills']), []);
});

test('a brace glob that names folders resolves when one branch matches, and fails when none does', () => {
  const dir = copy();
  edit(dir, LEGACY, '`tools/hook.mjs`', '`tools/hook.mjs` and `apps/{api,web}/src/`');
  assert.deepEqual(rulesOf(dir, ['skills']), []);
  edit(dir, LEGACY, '`apps/{api,web}/src/`', '`apps/{web,mobile}/`');
  assert.deepEqual(rulesOf(dir, ['skills']), [`${LEGACY}:path`]);
});

test('a backticked <prefix>-<name> token that is no skill, agent or reserved name fails', () => {
  const dir = copy();
  edit(dir, LEGACY, '# Legacy', '# Legacy\n\nRead `fx-backend-patterns` and `/fx-gone` first.');
  const found = rulesOf(dir, ['skills']).filter((r) => r === `${LEGACY}:skill-token`);
  assert.equal(found.length, 2);
});

test('a home path, a GitHub project node id and the vault word fail', () => {
  const dir = copy();
  edit(
    dir,
    LEGACY,
    '# Legacy',
    ['# Legacy', '', 'Open /Users/someone/code/x.', 'Board PVT_kwDOAbCdEf12.', 'Notes live in Obsidian.'].join('\n'),
  );
  const found = rulesOf(dir, ['skills']);
  for (const rule of ['home-path', 'project-id', 'vault']) assert.ok(found.includes(`${LEGACY}:${rule}`), rule);
});

test('a versioned Claude model id fails; the aliases do not', () => {
  const dir = copy();
  edit(dir, LEGACY, '# Legacy', '# Legacy\n\nUse `standard` (or opus), never claude-sonnet-9-9.');
  const found = rulesOf(dir, ['skills']);
  assert.deepEqual(found, [`${LEGACY}:model-id`]);
});

test('a path named in a hotspot file or settings.json that does not exist fails', () => {
  const dir = copy();
  edit(dir, '.claude/hooks/hotspots/foundation.json', '"docs/README.md"', '"docs/gone.md"');
  edit(dir, '.claude/settings.json', '/tools/hook.mjs', '/tools/gone.mjs');
  const found = rulesOf(dir, ['skills']);
  assert.ok(found.includes('.claude/hooks/hotspots/foundation.json:config-path'));
  assert.ok(found.includes('.claude/settings.json:config-path'));
});

// ── skills target: checks on files that carry the new frontmatter ────────────

test('a sources entry that is missing, or names a symbol its file lacks, fails', () => {
  const dir = copy();
  edit(dir, INDEX, 'widget.ts#WidgetService', 'widget.ts#GadgetService');
  edit(dir, REF, 'apps/api/src/widget.ts#listWidgets', 'apps/api/src/gone.ts');
  const found = rulesOf(dir, ['skills']);
  assert.ok(found.includes(`${INDEX}:anchor`));
  assert.ok(found.includes(`${REF}:source`));
});

test('a guards entry or rule tag that names no spec, lint rule, gate rule or script fails', () => {
  const dir = copy();
  edit(dir, REF, '  - script:guards', '  - script:nope\n  - gone.spec.ts');
  edit(dir, INDEX, '[guard: lint:no-raw-date]', '[guard: lint:no-such-rule]');
  const found = rulesOf(dir, ['skills']);
  assert.equal(found.filter((r) => r === `${REF}:guard`).length, 2);
  assert.ok(found.includes(`${INDEX}:guard`));
});

test('a gate: guard names a rule of the convention gate, and fails while there is none', () => {
  const dir = copy();
  edit(dir, REF, '  - script:guards', '  - gate:empty-catch');
  assert.ok(rulesOf(dir, ['skills']).includes(`${REF}:guard`));
  write(dir, 'tools/guards/convention-gate.mjs', "export const RULES = [{ id: 'empty-catch' }];\n");
  assert.deepEqual(rulesOf(dir, ['skills']), []);
});

test('an index over 200 lines and a reference over 450 lines fail', () => {
  const dir = copy();
  fs.appendFileSync(path.join(dir, INDEX), '\nfiller\n'.repeat(100));
  fs.appendFileSync(path.join(dir, REF), '\nfiller\n'.repeat(230));
  const found = rulesOf(dir, ['skills']);
  assert.ok(found.includes(`${INDEX}:size`));
  assert.ok(found.includes(`${REF}:size`));
});

test('the size budget does not apply to a skill without the new frontmatter', () => {
  const dir = copy();
  fs.appendFileSync(path.join(dir, LEGACY), '\nfiller\n'.repeat(300));
  assert.deepEqual(rulesOf(dir, ['skills']), []);
});

test('a rule without a guard tag or review-only fails, and review-only needs a reason', () => {
  const dir = copy();
  edit(dir, INDEX, 'Names are clear. [review-only: naming needs judgement]', 'Names are clear. [review-only]');
  edit(dir, INDEX, '- Dates are formatted once. [guard: lint:no-raw-date]', '- Dates are formatted once.');
  assert.equal(rulesOf(dir, ['skills']).filter((r) => r === `${INDEX}:rule-tag`).length, 2);
});

test('a requires: file whose feature folder is absent fails, and is fine once the folder exists', () => {
  const dir = copy();
  write(
    dir,
    '.claude/skills/fx-conventions/references/mobile.md',
    '---\nowner: foundation\nrequires: mobile\n---\n\n# Mobile\n',
  );
  write(dir, '.claude/hooks/hotspots/desk.json', '{ "hotspots": [] }\n');
  const found = rulesOf(dir, ['skills']);
  assert.ok(found.includes('.claude/skills/fx-conventions/references/mobile.md:requires'));
  assert.ok(found.includes('.claude/hooks/hotspots/desk.json:requires'));
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.mobile), { recursive: true });
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  assert.deepEqual(rulesOf(dir, ['skills']), []);
});

test('an owner: value other than foundation or product fails', () => {
  const dir = copy();
  edit(dir, REF, 'owner: foundation', 'owner: someone');
  assert.ok(rulesOf(dir, ['skills']).includes(`${REF}:owner`));
});

test('a file with the new frontmatter but no owner fails', () => {
  const dir = copy();
  edit(dir, REF, 'owner: foundation\n', '');
  assert.ok(rulesOf(dir, ['skills']).includes(`${REF}:owner`));
});

test('inline code in a rules section must name a word in the source tree or an examples entry', () => {
  const dir = copy();
  edit(dir, REF, '`ExampleThing` is only', '`MadeUpHelper` is only');
  assert.ok(rulesOf(dir, ['skills']).includes(`${REF}:symbol`));
});

test('a fenced example of ten lines or more must name the file it came from', () => {
  const dir = copy();
  edit(dir, REF, 'Copied from `apps/api/src/widget.ts`:', 'Like this:');
  assert.ok(rulesOf(dir, ['skills']).includes(`${REF}:example-origin`));
});

// ── docs target ─────────────────────────────────────────────────────────────

test('docs: a dead link or a missing backticked path fails', () => {
  const dir = copy();
  edit(dir, 'docs/README.md', '(../CLAUDE.md)', '(../GONE.md)');
  edit(dir, 'CLAUDE.md', 'Docs index', 'See `tools/gone.sh`. Docs index');
  const found = rulesOf(dir, ['docs']);
  assert.ok(found.includes('docs/README.md:link'));
  assert.ok(found.includes('CLAUDE.md:path'));
});

test('docs: a path the root .gitignore ignores, a {placeholder}, an MCP method and a ~~removed~~ path are skipped', () => {
  const dir = copy();
  write(dir, '.gitignore', '.env\n.env.*\n!.env.example\ntools/.dumps/\n');
  const line =
    'Copy to `apps/api/.env.local`, dumps in `tools/.dumps/`, tools in `tools/{domain}/`, `tools/list`; ' +
    'removed: ~~`apps/api/src/old.ts`~~.';
  edit(dir, 'docs/README.md', '# Docs', `# Docs\n\n${line}`);
  assert.deepEqual(rulesOf(dir, ['docs']), []);
  // the negation keeps a tracked example file checked
  edit(dir, 'docs/README.md', '# Docs', '# Docs\n\nSee `apps/api/.env.example`.');
  assert.deepEqual(rulesOf(dir, ['docs']), ['docs/README.md:path']);
});

test('docs: a link inside inline code or a fenced block is not followed', () => {
  const dir = copy();
  edit(dir, 'docs/README.md', '# Docs', '# Docs\n\nWrite `[x](gone.md)`.\n\n```md\n[y](gone.md)\n```');
  assert.deepEqual(rulesOf(dir, ['docs']), []);
});

test('docs: tools READMEs and .github markdown are checked, the plans folder is not', () => {
  const dir = copy();
  write(dir, 'tools/x/README.md', 'See `tools/x/gone.sh`.\n');
  write(dir, '.github/pull_request_template.md', 'See [it](gone.md).\n');
  write(dir, 'docs/plans/p.md', 'See [it](gone.md).\n');
  const found = rulesOf(dir, ['docs']);
  assert.deepEqual(found.sort(), ['.github/pull_request_template.md:link', 'tools/x/README.md:path']);
});

// ── source target ───────────────────────────────────────────────────────────

test('source: a comment that cites a path under .claude/ fails; code that names one does not', () => {
  const dir = copy();
  write(dir, 'apps/api/src/a.ts', '// see .claude/skills/legacy/SKILL.md\nexport const a = 1;\n');
  write(dir, 'tools/b.sh', 'ls ".claude/settings.json"\n');
  assert.deepEqual(rulesOf(dir, ['source']), ['apps/api/src/a.ts:cites-claude']);
});

test('source: a retired *-patterns name or a current hyphenated skill name fails', () => {
  const dir = copy();
  write(dir, 'apps/api/src/a.ts', '// per fx-backend-patterns §3\n// and fx-conventions\nexport const a = 1;\n');
  assert.equal(rulesOf(dir, ['source']).filter((r) => r === 'apps/api/src/a.ts:cites-skill').length, 2);
});

test('an invalid workflow.json fails every target', () => {
  const dir = copy();
  edit(dir, '.claude/workflow.json', '"skillPrefix": "fx"', '"skillPrefix": "F X"');
  assert.deepEqual(rulesOf(dir), ['.claude/workflow.json:config']);
});

test('a path inside an optional feature folder is checked only while that folder exists', () => {
  const dir = copy();
  edit(
    dir,
    'docs/README.md',
    '# Docs',
    `# Docs\n\nWithout it, \`${FEATURE_FOLDERS.mobile}/\` and \`${FEATURE_FOLDERS.desk}/x.ts\` are gone.`,
  );
  assert.deepEqual(rulesOf(dir, ['docs']), []);
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  assert.deepEqual(rulesOf(dir, ['docs']), ['docs/README.md:path']);
});
