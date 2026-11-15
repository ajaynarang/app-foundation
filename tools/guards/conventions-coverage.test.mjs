// What the foundation built, and the reference and recipe that teach it. One row per area of the platform (the API
// contract and lists, the outbox and deadlines, the web kit, AI routing and tools, observability, the outbound gate,
// plan enforcement, tenancy, sessions, deploy). A row fails when its reference is missing, is still moved text
// (`status: interim`), or has no `## Recipe` section, so a new product can build on the area without reading how it
// was designed. Reads the skill prefix from .claude/workflow.json, so it holds after `init-app` renames the skills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { skillPrefix } = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'workflow.json'), 'utf8'));
const SKILLS = path.join(ROOT, '.claude', 'skills');
const REFERENCES = path.join(SKILLS, `${skillPrefix}-conventions`, 'references');

/** Area, then the reference files that cover it; each needs at least one recipe across the row. */
const COVERAGE = [
  ['API contract, error envelope, lists', ['api-contract.md', 'errors.md', 'lists-and-pagination.md']],
  ['Outbox, events, deadlines, queues', ['events-and-outbox.md', 'jobs-and-deadlines.md']],
  ['Web kit', ['frontend-lists.md', 'forms-and-sheets.md', 'ui-grammar.md']],
  ['Routing, tenant keys, OpenRouter', ['ai-routing.md']],
  ['Tool enforcement', ['ai-tools.md']],
  ['Chat, knowledge base, evals', ['ai.md']],
  ['Logging standard, error tracking, metrics, alerts', ['observability.md']],
  ['Outbound gate', ['outbound-gate.md']],
  ['Plan enforcement', ['plans-and-entitlements.md']],
  ['Tenant context, sessions, login', ['tenancy.md', 'auth-and-access.md']],
  ['Deploy and operations', ['infra-and-deploy.md']],
];

const frontmatter = (text) => (text.match(/^---\n([\s\S]*?)\n---\n/) ?? [, ''])[1];

for (const [area, files] of COVERAGE) {
  test(`${area}: ${files.join(', ')} exist, are final and carry a recipe`, () => {
    let recipes = 0;
    for (const file of files) {
      const full = path.join(REFERENCES, file);
      assert.ok(fs.existsSync(full), `missing reference ${path.relative(ROOT, full)}`);
      const text = fs.readFileSync(full, 'utf8');
      assert.doesNotMatch(frontmatter(text), /^status:\s*interim\b/m, `${file} is still status: interim`);
      recipes += (text.match(/^## Recipe\b/gm) ?? []).length;
    }
    assert.ok(recipes > 0, `no "## Recipe" section in ${files.join(', ')}`);
  });
}

test('no conventions reference is still status: interim', () => {
  const interim = fs
    .readdirSync(REFERENCES)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /^status:\s*interim\b/m.test(frontmatter(fs.readFileSync(path.join(REFERENCES, f), 'utf8'))));
  assert.deepEqual(interim, []);
});

test('the deploy skill exists for the deploy workflows', () => {
  assert.ok(fs.existsSync(path.join(SKILLS, `${skillPrefix}-deploy`, 'SKILL.md')), `missing ${skillPrefix}-deploy`);
});
