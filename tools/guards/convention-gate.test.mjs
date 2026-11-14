// Tests for tools/guards/convention-gate.mjs. Each rule gets a hit and a miss on a temp tree; the baseline ratchet
// (a count may only fall, a new key fails, a stale entry fails until --update-baseline) is checked end to end
// through the CLI. Nothing here touches git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_FILE,
  RULE_IDS,
  checkFile,
  compareToBaseline,
  countTree,
  parseBaselineText,
  rulesThatGrew,
  stripComments,
} from './convention-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'convention-gate.mjs');
const ROOT = path.resolve(HERE, '..', '..');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'convention-gate-'));
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const gate = (dir, ...args) =>
  spawnSync(process.execPath, [GATE, '--root', dir, ...args], { cwd: dir, encoding: 'utf8' });
const rules = (rel, text) => Object.keys(checkFile(rel, text)).sort();

// ── the rules ────────────────────────────────────────────────────────────────

test('throw new Error( in a controller or service on an HTTP path is a hit', () => {
  const text = "export class A { f() { throw new Error('x'); } }\n";
  assert.deepEqual(rules('apps/backend/src/domains/x/x.service.ts', text), ['http-plain-error']);
  assert.deepEqual(rules('apps/backend/src/domains/x/x.controller.ts', text), ['http-plain-error']);
  assert.deepEqual(rules('packages/appshore/platform/src/domains/y/y.service.ts', text), ['http-plain-error']);
});

test('throw new Error( in processors, workers, steps, consumers and plain files is not a hit', () => {
  const text = "throw new Error('x');\n";
  for (const rel of [
    'apps/backend/src/domains/x/x.processor.service.ts',
    'apps/backend/src/domains/x/x-worker.service.ts',
    'apps/backend/src/domains/x/x.step.service.ts',
    'apps/backend/src/domains/x/x-consumer.service.ts',
    'apps/backend/src/domains/x/x.helper.ts',
  ])
    assert.deepEqual(rules(rel, text), [], rel);
});

test('an empty catch block and .catch(() => {}) are hits; a catch with a body or a comment is not', () => {
  const rel = 'apps/backend/src/domains/x/x.helper.ts';
  assert.deepEqual(rules(rel, 'try { f(); } catch (e) {}\n'), ['empty-catch']);
  assert.deepEqual(rules(rel, 'try { f(); } catch {\n}\n'), ['empty-catch']);
  assert.deepEqual(rules(rel, 'p.catch(() => {});\n'), ['empty-catch']);
  assert.deepEqual(rules(rel, 'p.catch((_e) => { });\n'), ['empty-catch']);
  assert.deepEqual(rules(rel, 'try { f(); } catch (e) { log(e); }\n'), []);
  assert.deepEqual(rules(rel, 'try { f(); } catch { /* best effort: the file may be gone */ }\n'), []);
  assert.equal(checkFile(rel, 'a.catch(() => {}); b.catch(() => {});\n')['empty-catch'], 2);
});

test('process.env outside config and bootstrap files is a hit', () => {
  const text = 'const a = process.env.A;\n';
  assert.deepEqual(rules('apps/backend/src/domains/x/x.service.ts', text), ['process-env']);
  assert.deepEqual(rules('apps/web/src/features/x/api.ts', text), ['process-env']);
  assert.deepEqual(rules('packages/appshore/kernel/src/shared/x.ts', text), ['process-env']);
  for (const rel of [
    'apps/backend/src/config/configuration.ts',
    'apps/backend/src/main.ts',
    'apps/backend/src/bootstrap/openapi.ts',
    'apps/web/next.config.ts',
    'apps/web/src/instrumentation.ts',
    'packages/appshore/kernel/src/infrastructure/telemetry/telemetry.ts',
    'packages/appshore/db/prisma/seeds/utils.ts',
    'apps/backend/scripts/seed.ts',
  ])
    assert.deepEqual(rules(rel, text), [], rel);
});

test('a raw <button> or <input> in the web app is a hit; the shadcn component is not', () => {
  const rel = 'apps/web/src/features/x/form.tsx';
  assert.deepEqual(rules(rel, 'export const A = () => <button onClick={f}>x</button>;\n'), ['raw-control']);
  assert.deepEqual(rules(rel, 'export const A = () => <input/>;\n'), ['raw-control']);
  assert.deepEqual(rules(rel, 'export const A = () => <Button>x</Button>;\n'), []);
  assert.deepEqual(rules(rel, 'export const A = () => <buttonGroup />;\n'), []);
  assert.deepEqual(rules('packages/ui/src/components/ui/button.tsx', '<button />\n'), []);
});

test('a backend or package file over 800 lines and a web .tsx over 300 are hits, counted in lines', () => {
  const lines = (n) => 'const a = 1;\n'.repeat(n);
  assert.equal(checkFile('apps/backend/src/domains/x/big.ts', lines(801))['file-size'], 801);
  assert.equal(checkFile('apps/backend/src/domains/x/big.ts', lines(800))['file-size'], undefined);
  assert.equal(checkFile('packages/appshore/kernel/src/big.ts', lines(900))['file-size'], 900);
  assert.equal(checkFile('apps/web/src/features/x/page.tsx', lines(301))['file-size'], 301);
  assert.equal(checkFile('apps/web/src/features/x/page.tsx', lines(300))['file-size'], undefined);
});

test('tests, generated files, migrations and text in comments are not checked', () => {
  const text = "throw new Error('x'); const a = process.env.A; p.catch(() => {});\n";
  for (const rel of [
    'apps/backend/src/domains/x/x.service.spec.ts',
    'apps/backend/src/domains/x/__tests__/x.service.ts',
    'apps/web/src/features/x/x.test.tsx',
    'packages/shared-types/src/generated/prisma-enums.ts',
    'packages/appshore/db/prisma/migrations/1_init/x.ts',
    'apps/backend/src/x.d.ts',
  ])
    assert.deepEqual(rules(rel, text), [], rel);
  assert.deepEqual(
    rules(
      'apps/backend/src/domains/x/x.service.ts',
      '// never throw new Error( here, nor read process.env\n/* catch {} */\n',
    ),
    [],
  );
});

test('stripComments keeps strings and line count', () => {
  const src = "const a = '// not a comment'; // gone\n/* gone\n too */ const b = `x`;\n";
  const out = stripComments(src);
  assert.match(out, /'\/\/ not a comment'/);
  assert.doesNotMatch(out, /gone/);
  assert.equal(out.split('\n').length, src.split('\n').length);
});

test('every rule id is quoted in the gate, so a skill may cite it as gate:<rule>', () => {
  const text = fs.readFileSync(GATE, 'utf8');
  for (const id of RULE_IDS) assert.match(text, new RegExp(`'${id}'`));
});

// ── the baseline ─────────────────────────────────────────────────────────────

const SERVICE = 'apps/backend/src/domains/x/x.service.ts';
const OTHER = 'apps/backend/src/domains/x/y.service.ts';
const ERR = "throw new Error('x');\n";

test('compareToBaseline: a new key and a higher count fail, a lower count is stale', () => {
  const baseline = { [SERVICE]: { 'http-plain-error': 2 } };
  assert.deepEqual(compareToBaseline({ [SERVICE]: { 'http-plain-error': 2 } }, baseline), {
    over: [],
    stale: [],
  });
  const { over } = compareToBaseline({ [SERVICE]: { 'http-plain-error': 3 }, [OTHER]: { 'process-env': 1 } }, baseline);
  assert.deepEqual(
    over.map((o) => `${o.file}:${o.rule}:${o.count}/${o.allowed}`),
    [`${SERVICE}:http-plain-error:3/2`, `${OTHER}:process-env:1/0`],
  );
  const { stale } = compareToBaseline({ [SERVICE]: { 'http-plain-error': 1 } }, baseline);
  assert.deepEqual(
    stale.map((s) => `${s.file}:${s.rule}:${s.count}/${s.allowed}`),
    [`${SERVICE}:http-plain-error:1/2`],
  );
});

test('the CLI passes a tree whose hits match the baseline, and fails a new hit', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR);
  assert.equal(gate(dir).status, 1, 'no baseline yet: the hit is new');
  const up = gate(dir, '--update-baseline');
  assert.equal(up.status, 0, up.stdout + up.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, BASELINE_FILE), 'utf8')).entries, {
    [SERVICE]: { 'http-plain-error': 1 },
  });
  const ok = gate(dir);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /convention-gate: PASS/);
  write(dir, OTHER, ERR);
  const bad = gate(dir);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /y\.service\.ts.*http-plain-error/);
});

test('the CLI fails a count that fell until the baseline is updated, so the ratchet tightens', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR + ERR);
  gate(dir, '--update-baseline');
  write(dir, SERVICE, ERR);
  const r = gate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--update-baseline/);
  assert.equal(gate(dir, '--update-baseline').status, 0);
  assert.equal(gate(dir).status, 0);
});

test('--update-baseline refuses to raise a count or add a key', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR);
  gate(dir, '--update-baseline');
  write(dir, SERVICE, ERR + ERR);
  const r = gate(dir, '--update-baseline');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /http-plain-error/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, BASELINE_FILE), 'utf8')).entries, {
    [SERVICE]: { 'http-plain-error': 1 },
  });
});

test('rulesThatGrew: a hit that moved to another file is not growth; a new hit is', () => {
  const baseline = { [SERVICE]: { 'http-plain-error': 2 } };
  assert.deepEqual(rulesThatGrew({ [OTHER]: { 'http-plain-error': 2 } }, baseline), []);
  assert.deepEqual(
    rulesThatGrew({ [SERVICE]: { 'http-plain-error': 1 }, [OTHER]: { 'http-plain-error': 1 } }, baseline),
    [],
  );
  assert.deepEqual(
    rulesThatGrew({ [OTHER]: { 'http-plain-error': 2, 'process-env': 1 } }, baseline).map(
      (g) => `${g.rule}:${g.count}/${g.allowed}`,
    ),
    ['process-env:1/0'],
  );
  assert.deepEqual(
    rulesThatGrew({ [SERVICE]: { 'http-plain-error': 2 }, [OTHER]: { 'http-plain-error': 1 } }, baseline).map(
      (g) => `${g.rule}:${g.count}/${g.allowed}`,
    ),
    ['http-plain-error:3/2'],
  );
});

test('--update-baseline --allow-moved accepts a renamed or split file, and still refuses a new hit', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR + ERR);
  gate(dir, '--update-baseline');
  fs.rmSync(path.join(dir, SERVICE));
  write(dir, OTHER, ERR + ERR);
  const plain = gate(dir, '--update-baseline');
  assert.equal(plain.status, 1, 'without the flag a moved hit is a new key');
  assert.match(plain.stdout, /--allow-moved/);
  const moved = gate(dir, '--update-baseline', '--allow-moved');
  assert.equal(moved.status, 0, moved.stdout + moved.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, BASELINE_FILE), 'utf8')).entries, {
    [OTHER]: { 'http-plain-error': 2 },
  });
  assert.equal(gate(dir).status, 0);
  write(dir, SERVICE, ERR);
  const grew = gate(dir, '--update-baseline', '--allow-moved');
  assert.equal(grew.status, 1, 'a hit that adds to the total is new code, not a move');
  assert.match(grew.stderr, /http-plain-error/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, BASELINE_FILE), 'utf8')).entries, {
    [OTHER]: { 'http-plain-error': 2 },
  });
});

test('a baseline with merge-conflict markers is read as the larger side of each entry, then regenerated', () => {
  const ours = JSON.stringify({ entries: { [SERVICE]: { 'http-plain-error': 2 } } }, null, 2).split('\n');
  const theirs = JSON.stringify(
    { entries: { [SERVICE]: { 'http-plain-error': 1 }, [OTHER]: { 'process-env': 1 } } },
    null,
    2,
  ).split('\n');
  const conflicted = ['<<<<<<< HEAD', ...ours, '=======', ...theirs, '>>>>>>> other', ''].join('\n');
  assert.deepEqual(parseBaselineText(conflicted), {
    [SERVICE]: { 'http-plain-error': 2 },
    [OTHER]: { 'process-env': 1 },
  });
  const dir = tmp();
  write(dir, SERVICE, ERR);
  write(dir, BASELINE_FILE, conflicted);
  const r = gate(dir, '--update-baseline');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(gate(dir).status, 0);
});

test('--files checks only the named files, and skips files outside its scope', () => {
  const dir = tmp();
  write(dir, SERVICE, ERR);
  write(dir, OTHER, 'export const ok = 1;\n');
  write(dir, 'README.md', 'throw new Error(\n');
  assert.equal(gate(dir, '--files', path.join(dir, OTHER), path.join(dir, 'README.md')).status, 0);
  const r = gate(dir, '--files', path.join(dir, SERVICE));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /x\.service\.ts/);
});

test('countTree skips node_modules, build output and other checkouts', () => {
  const dir = tmp();
  for (const prefix of ['apps/backend/node_modules/x/', 'apps/backend/dist/', '.worktrees/a/', 'apps/web/.next/'])
    write(dir, `${prefix}apps/backend/src/domains/x/x.service.ts`, ERR);
  assert.deepEqual(countTree(dir), {});
});

test('the repository itself passes against its committed baseline', () => {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
