// The domain seam: the one place a product adds its own knowledge on top of the foundation rules, and the four places
// the generic workflow reads it (docs/adding-your-domain.md). The skills guard checks that every path a skill cites
// exists; it cannot see a consumer that stops citing the seam, a section that is renamed out from under a link, or
// a runway that skips a binding doc. These tests read the real repository with the prefix from .claude/workflow.json,
// so they hold after init-app renames the skills. Nothing here touches git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './skills-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => {
  const file = path.join(ROOT, rel);
  assert.ok(fs.existsSync(file), `${rel} does not exist`);
  return fs.readFileSync(file, 'utf8');
};
const P = JSON.parse(read('.claude/workflow.json')).skillPrefix;
const DOMAIN = `.claude/skills/${P}-domain`;
const REFS = ['personas.md', 'review-checks.md', 'test-preconditions.md'];
const SECTIONS = [
  'Vocabulary',
  'Roles and personas',
  'Invariants',
  'Where this product differs',
  'Domain review checks',
  'Domain hotspots',
];
// GitHub's heading slug, which is what a `#fragment` link resolves against.
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
const headings = (text) => [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);

test('the domain skill ships as a product-owned template with its six sections', () => {
  const { fm, body } = parseFrontmatter(read(`${DOMAIN}/SKILL.md`));
  assert.equal(fm?.name, `${P}-domain`);
  assert.equal(fm?.owner, 'product', 'the domain skill is the product’s, never the foundation’s');
  const have = headings(body).map((h) => h.toLowerCase());
  for (const s of SECTIONS) assert.ok(have.includes(s.toLowerCase()), `${DOMAIN}/SKILL.md lacks "## ${s}"`);
});

test('each domain reference is product-owned, says whether it is filled, and is linked from the domain skill', () => {
  const index = read(`${DOMAIN}/SKILL.md`);
  for (const ref of REFS) {
    const { fm } = parseFrontmatter(read(`${DOMAIN}/references/${ref}`));
    assert.equal(fm?.owner, 'product', `${ref}: owner: product`);
    assert.ok(['true', 'false'].includes(fm?.filled), `${ref}: filled: true or false, so a reader knows it is empty`);
    assert.ok(index.includes(`(references/${ref})`), `${DOMAIN}/SKILL.md does not link references/${ref}`);
  }
});

test('the four consumers read the seam', () => {
  const cite = (ref) => `${DOMAIN}/references/${ref}`;
  // 1. The reviewer's domain dimension reads the domain review checks.
  // Each consumer also treats `filled: false` as absent, so an empty template never yields an invented check or persona.
  const unfilled = (rel, text) => assert.ok(text.includes('`filled: false`'), `${rel} does not handle filled: false`);
  const reviewer = read(`.claude/agents/${P}-reviewer.md`);
  assert.ok(reviewer.includes(cite('review-checks.md')), `${P}-reviewer`);
  unfilled(`${P}-reviewer`, reviewer);
  // 2. Test notes, the QA runner and the persona read the personas and the test preconditions.
  for (const rel of [
    `.claude/skills/${P}-test-notes/SKILL.md`,
    `.claude/agents/${P}-qa-runner.md`,
    `.claude/agents/${P}-persona.md`,
  ]) {
    const text = read(rel);
    for (const ref of ['personas.md', 'test-preconditions.md']) assert.ok(text.includes(cite(ref)), `${rel} → ${ref}`);
    unfilled(rel, text);
  }
  // 3. The drift reminder reads the product's hotspot file, and the domain skill sends the product there.
  read('.claude/hooks/hotspots/product.json');
  assert.ok(read(`${DOMAIN}/SKILL.md`).includes('.claude/hooks/hotspots/product.json'));
  // 4. The conventions index links "Where this product differs", and the anchor resolves.
  const link = `../${P}-domain/SKILL.md#${slug('Where this product differs')}`;
  assert.ok(read(`.claude/skills/${P}-conventions/SKILL.md`).includes(`(${link})`), `the index does not link ${link}`);
  const anchors = headings(read(`${DOMAIN}/SKILL.md`)).map(slug);
  assert.ok(anchors.includes(slug('Where this product differs')));
});

test('the guide for adding a domain links the domain skill and the runway', () => {
  const guide = read('docs/adding-your-domain.md');
  assert.ok(guide.includes(`../${DOMAIN}/SKILL.md`), 'docs/adding-your-domain.md links the domain skill');
  assert.ok(guide.includes(`${P}-runway`), 'docs/adding-your-domain.md names the runway skill');
});

test('the runway writes the binding docs in order, then fills the domain skill and the CLAUDE.md binding table', () => {
  const { fm, body } = parseFrontmatter(read(`.claude/skills/${P}-runway/SKILL.md`));
  assert.equal(fm?.owner, 'foundation');
  assert.ok(body.includes('superpowers:brainstorming'), 'the runway wraps superpowers:brainstorming');
  const order = [
    'docs/VISION.md',
    'docs/domain-map.md',
    'docs/lifecycles-and-invariants.md',
    'docs/adr/',
    'docs/event-vocabulary.md',
    'docs/module-map.md',
    'docs/epics.md',
    `${DOMAIN}/SKILL.md`,
    'CLAUDE.md',
  ];
  // Each step is a "### Step" heading; the first heading naming a doc is where that doc is written.
  const steps = body.split(/^### /m).slice(1);
  const at = order.map((doc) => steps.findIndex((s) => s.split('\n')[0].includes(doc)));
  order.forEach((doc, i) => assert.ok(at[i] >= 0, `no runway step heading names ${doc}`));
  for (let i = 1; i < at.length; i++)
    assert.ok(at[i] > at[i - 1], `the runway writes ${order[i]} before ${order[i - 1]}`);
  for (const ref of REFS) assert.ok(body.includes(`${DOMAIN}/references/${ref}`), `the runway fills ${ref}`);
});
