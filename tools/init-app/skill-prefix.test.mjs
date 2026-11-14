// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  defaultSkillPrefix,
  inSkillNameScope,
  oldSkillNameHits,
  renameSkills,
  replaceSkillNames,
  reservedNamesFor,
  skillPrefixProblems,
  workflowSkillNames,
} from './skill-prefix.mjs';

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-prefix-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const TEMPLATE_RESERVED = ['app-foundation', 'app-backend', 'app-postgres', 'app-inngest'];

test('the default prefix: one short word as is, the initials of several words, three letters of one long word', () => {
  assert.equal(defaultSkillPrefix('acme'), 'acme');
  assert.equal(defaultSkillPrefix('shopkeep'), 'shopkeep'); // 8 characters: still one short word
  assert.equal(defaultSkillPrefix('acme-crm'), 'ac');
  assert.equal(defaultSkillPrefix('big-red-dog-app'), 'brda');
  assert.equal(defaultSkillPrefix('scaffoldcheck'), 'sca');
  assert.equal(defaultSkillPrefix('northwind'), 'nor');
});

test('a prefix is 2 to 12 lowercase letters or digits, and never a reserved name or the start of one', () => {
  const reserved = reservedNamesFor('acme', 'acme', TEMPLATE_RESERVED);
  const names = ['app-plan', 'app-review'];
  assert.deepEqual(skillPrefixProblems('ac', reserved, names), []);
  assert.deepEqual(skillPrefixProblems('acme', reserved, names), []);
  assert.match(skillPrefixProblems('a', reserved, names).join(), /2 to 12/);
  assert.match(skillPrefixProblems('Ac', reserved, names).join(), /2 to 12/);
  assert.match(skillPrefixProblems('a-b', reserved, names).join(), /2 to 12/);
  assert.match(skillPrefixProblems('thirteenchars', reserved, names).join(), /2 to 12/);
  assert.match(skillPrefixProblems('1ab', reserved, names).join(), /2 to 12/);
  // A prefix that equals a reserved name is refused.
  assert.match(skillPrefixProblems('acmex', ['acmex'], names).join(), /reserved/);
  // So is one under which a skill would start with a reserved name (acme-backend is a Doppler project).
  assert.match(skillPrefixProblems('acme', ['acme-backend'], ['app-backend-notes']).join(), /acme-backend/);
});

test('the reserved names follow the rename rules: the template name becomes the app name, app-x becomes <name>-x', () => {
  assert.deepEqual(reservedNamesFor('acme-crm', 'ac', TEMPLATE_RESERVED), [
    'acme-crm',
    'acme-crm-backend',
    'acme-crm-postgres',
    'acme-crm-inngest',
  ]);
  // When the prefix is the app name, the bare name is left out: every skill would otherwise start with it.
  assert.deepEqual(reservedNamesFor('acme', 'acme', TEMPLATE_RESERVED), [
    'acme-backend',
    'acme-postgres',
    'acme-inngest',
  ]);
});

test('names are replaced as whole tokens only, longest first', () => {
  const names = ['app-qa', 'app-qa-runner', 'app-review', 'app-reviewer', 'app-dev-docs'];
  const text = [
    'Run `/app-qa`, then hand off to `app-qa-runner` and `app-reviewer`.',
    'See .claude/skills/app-review/SKILL.md and [docs](../app-dev-docs/SKILL.md).',
    'Leave tools/dev/app-dev.sh, app-backend, my-app-qa and app-qa_x alone.',
    'name: app-review',
  ].join('\n');
  assert.equal(
    replaceSkillNames(text, names, 'app', 'zz'),
    [
      'Run `/zz-qa`, then hand off to `zz-qa-runner` and `zz-reviewer`.',
      'See .claude/skills/zz-review/SKILL.md and [docs](../zz-dev-docs/SKILL.md).',
      'Leave tools/dev/app-dev.sh, app-backend, my-app-qa and app-qa_x alone.',
      'name: zz-review',
    ].join('\n'),
  );
});

test('source code is out of scope: a skill name there is an identifier (an Inngest app id), not a citation', () => {
  assert.equal(inSkillNameScope('apps/backend/src/domains/desk/core/inngest/inngest.client.ts'), false);
  assert.equal(inSkillNameScope('packages/appshore/kernel/src/x.ts'), false);
  assert.equal(inSkillNameScope('tests/api/x.spec.ts'), false);
  assert.equal(inSkillNameScope('infra/terraform/main.tf'), false);
  assert.equal(inSkillNameScope('apps/backend/README.md'), true);
  assert.equal(inSkillNameScope('.claude/skills/app-plan/SKILL.md'), true);
  assert.equal(inSkillNameScope('CLAUDE.md'), true);
  assert.equal(inSkillNameScope('docs/how-we-build.md'), true);
  assert.equal(inSkillNameScope('.github/pull_request_template.md'), true);
  assert.equal(inSkillNameScope('tools/guards/skills-guard.mjs'), true);
});

function workflowTree() {
  return tree({
    '.claude/skills/app-plan/SKILL.md': '---\nname: app-plan\n---\nThen run `/app-review`.\n',
    '.claude/skills/app-review/SKILL.md': '---\nname: app-review\n---\nSend `app-reviewer`.\n',
    '.claude/skills/app-review/references/x.md': 'Back to [plan](../../app-plan/SKILL.md).\n',
    '.claude/agents/app-reviewer.md': '---\nname: app-reviewer\n---\nOne dimension.\n',
    'CLAUDE.md': 'Loop: `app-plan` then `app-review`.\n',
    'apps/backend/src/x.ts': "export const id = 'app-plan';\n",
    'docs/superpowers/plan.md': 'app-plan\n',
  });
}

test('renameSkills renames each folder and agent file, then every whole-token mention in scope', () => {
  const root = workflowTree();
  assert.deepEqual(workflowSkillNames(root, 'app'), ['app-plan', 'app-review', 'app-reviewer']);
  const actions = renameSkills(root, { from: 'app', to: 'zz' });
  assert.ok(actions.some((a) => a.includes('.claude/skills/app-plan → .claude/skills/zz-plan')));
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/zz-plan/SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, '.claude/agents/zz-reviewer.md')));
  assert.ok(!fs.existsSync(path.join(root, '.claude/skills/app-plan')));
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  assert.equal(read('.claude/skills/zz-plan/SKILL.md'), '---\nname: zz-plan\n---\nThen run `/zz-review`.\n');
  assert.equal(read('.claude/skills/zz-review/references/x.md'), 'Back to [plan](../../zz-plan/SKILL.md).\n');
  assert.equal(read('CLAUDE.md'), 'Loop: `zz-plan` then `zz-review`.\n');
  // Out of scope, and what the rename walker skips, stay as they were.
  assert.equal(read('apps/backend/src/x.ts'), "export const id = 'app-plan';\n");
  assert.equal(read('docs/superpowers/plan.md'), 'app-plan\n');
  assert.deepEqual(oldSkillNameHits(root, ['app-plan', 'app-review', 'app-reviewer']), []);
});

test('a dry run renames nothing and reports the same actions', () => {
  const root = workflowTree();
  const actions = renameSkills(root, { from: 'app', to: 'zz', dryRun: true });
  assert.ok(actions.length > 0);
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/app-plan/SKILL.md')));
  assert.equal(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), 'Loop: `app-plan` then `app-review`.\n');
});

test('the old-name search finds a mention the rename missed, in scope only', () => {
  const root = tree({
    'CLAUDE.md': 'Run `app-plan`.\n',
    'docs/a.md': 'nothing\n',
    'apps/backend/src/x.ts': "id: 'app-plan'\n",
  });
  assert.deepEqual(oldSkillNameHits(root, ['app-plan']), ['CLAUDE.md:1: app-plan']);
});
