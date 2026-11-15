// foundation.json's reader: the glob rules, the three classes, the skill-prefix path map and the shape checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, classifier, classifierFor, globToRegExp, toTemplatePath, validateManifest } from './manifest.mjs';

const product = {
  version: '0.2.0',
  template: 'https://example.com/template',
  owned: ['packages/appshore/**', '.claude/skills/app-*/**', 'apps/backend/src/main.ts', 'tools/**'],
  seams: ['packages/appshore/db/prisma/schema/app.prisma', '.claude/skills/app-domain/**'],
  base: { version: '0.2.0', commit: 'a'.repeat(40) },
  scaffold: {
    name: 'acme',
    displayName: 'Acme',
    scope: '@app',
    db: 'acme',
    tenancy: 'multi',
    mobile: 'yes',
    desk: 'no',
    skillPrefix: 'ac',
    plans: 'tracked',
  },
};
const template = { ...product, base: null, scaffold: null };

test('** crosses folders and * stays inside one segment', () => {
  assert.ok(globToRegExp('packages/**').test('packages/a/b/c.ts'));
  assert.ok(globToRegExp('a/**/x.ts').test('a/x.ts'));
  assert.ok(globToRegExp('a/**/x.ts').test('a/b/c/x.ts'));
  assert.ok(globToRegExp('.claude/skills/app-*/**').test('.claude/skills/app-plan/SKILL.md'));
  assert.ok(!globToRegExp('.claude/skills/app-*/**').test('.claude/skills/other/SKILL.md'));
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(!globToRegExp('a.ts').test('axts'), 'a dot is a dot');
  assert.ok(!globToRegExp('packages/**').test('apps/packages/x'), 'anchored at the start');
});

test('a seam wins over the owned folder it sits in; the rest is starter content', () => {
  const classify = classifier(template);
  assert.equal(classify('packages/appshore/platform/src/auth/x.ts'), CLASS.OWNED);
  assert.equal(classify('packages/appshore/db/prisma/schema/app.prisma'), CLASS.SEAM);
  assert.equal(classify('packages/appshore/db/prisma/schema/foundation.prisma'), CLASS.OWNED);
  assert.equal(classify('apps/backend/src/main.ts'), CLASS.OWNED);
  assert.equal(classify('apps/web/src/app/page.tsx'), CLASS.STARTER);
  assert.equal(classify('README.md'), CLASS.STARTER);
});

test("a product's renamed skill is classified under its template name", () => {
  assert.equal(toTemplatePath('.claude/skills/ac-plan/SKILL.md', product.scaffold), '.claude/skills/app-plan/SKILL.md');
  assert.equal(toTemplatePath('.claude/agents/ac-reviewer.md', product.scaffold), '.claude/agents/app-reviewer.md');
  assert.equal(toTemplatePath('apps/ac-plan/x.ts', product.scaffold), 'apps/ac-plan/x.ts', 'only skills and agents');
  assert.equal(toTemplatePath('.claude/skills/app-plan/SKILL.md', null), '.claude/skills/app-plan/SKILL.md');
  const classify = classifierFor(product);
  assert.equal(classify('.claude/skills/ac-plan/SKILL.md'), CLASS.OWNED);
  assert.equal(classify('.claude/skills/ac-domain/SKILL.md'), CLASS.SEAM);
  assert.equal(classify('.claude/skills/acme-own-skill/SKILL.md'), CLASS.STARTER);
});

test('a valid template and a valid product pass', () => {
  assert.deepEqual(validateManifest(template), []);
  assert.deepEqual(validateManifest(product), []);
});

test('each broken shape is named', () => {
  const broken = (patch) => validateManifest({ ...product, ...patch }).join(' | ');
  assert.match(validateManifest(null).join(), /not a JSON object/);
  assert.match(broken({ version: 'v1' }), /version must look like/);
  assert.match(broken({ template: '' }), /template must be/);
  assert.match(broken({ owned: [] }), /owned must be/);
  assert.match(broken({ seams: 'x' }), /seams must be/);
  assert.match(broken({ owned: ['/abs/**'] }), /repo-relative/);
  assert.match(broken({ owned: ['a/../b'] }), /repo-relative/);
  assert.match(broken({ base: { version: '0.2.0', commit: 'abc' } }), /full commit sha/);
  assert.match(broken({ base: { version: 'x', commit: null } }), /base.version/);
  assert.match(broken({ scaffold: { ...product.scaffold, skillPrefix: '' } }), /scaffold.skillPrefix is missing/);
  assert.match(broken({ base: null }), /both null .* or both set/);
  assert.deepEqual(validateManifest({ ...product, base: { version: '0.2.0', commit: null } }), []);
});
