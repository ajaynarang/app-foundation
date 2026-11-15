// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  featurePresence,
  findMarkerBlocks,
  listFeature,
  listFeatureNames,
  loadManifest,
  removeFeature,
} from './apply-feature.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MANIFEST = {
  name: 'demo',
  paths: ['src/demo', 'src/glue/demo.feature.ts', 'missing.txt'],
  markers: ['src/glue/index.ts', '.env.example', 'README.md', 'compose.yml', 'gone.ts'],
  jsonEntries: [
    { file: 'package.json', path: ['scripts', 'demo:dev'] },
    { file: 'package.json', path: ['dependencies', 'demo-sdk'] },
    { file: 'caps.json', path: ['enabled'], value: 'demo' },
    { file: 'absent.json', path: ['x'] },
  ],
  allowlistPrefixes: [{ prefix: 'src/demo/', files: ['allow.json', 'absent-allow.json'] }],
};

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-feature-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('src/demo/a.ts', 'export const a = 1;\n');
  write('src/glue/demo.feature.ts', 'export {};\n');
  write(
    'src/glue/index.ts',
    [
      "import { other } from './other';",
      '// feature:demo:start',
      "import { DEMO } from './demo.feature';",
      '// feature:demo:end',
      'export const FEATURES = [',
      '  other,',
      '  // feature:demo:start',
      '  DEMO,',
      '  // feature:demo:end',
      '];',
      '',
    ].join('\n'),
  );
  write('.env.example', 'A=1\n# feature:demo:start\nDEMO_KEY=\n# feature:demo:end\nB=2\n');
  write('README.md', '# Title\n\n<!-- feature:demo:start -->\nDemo line.\n<!-- feature:demo:end -->\n\nRest.\n');
  write('compose.yml', 'services:\n  db: {}\n  # feature:demo:start\n  demo: {}\n  # feature:demo:end\n');
  write(
    'package.json',
    JSON.stringify(
      { name: 'x', scripts: { build: 'b', 'demo:dev': 'd' }, dependencies: { 'demo-sdk': '1', keep: '1' } },
      null,
      2,
    ) + '\n',
  );
  write('caps.json', JSON.stringify({ enabled: ['a', 'demo', 'b'] }, null, 2) + '\n');
  write(
    'allow.json',
    JSON.stringify(
      { RULE: { 'src/demo/x.ts :: GET /x': 'r', 'src/other.ts :: GET /y': 'r' }, 'src/demo/top.ts': { count: 1 } },
      null,
      2,
    ) + '\n',
  );
  return root;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('--remove deletes paths, strips every marked block, JSON entry and allowlist key', () => {
  const root = fixture();
  removeFeature(root, MANIFEST);

  assert.equal(fs.existsSync(path.join(root, 'src/demo')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/glue/demo.feature.ts')), false);
  assert.equal(
    read(root, 'src/glue/index.ts'),
    "import { other } from './other';\nexport const FEATURES = [\n  other,\n];\n",
  );
  assert.equal(read(root, '.env.example'), 'A=1\nB=2\n');
  assert.equal(read(root, 'README.md'), '# Title\n\n\nRest.\n');
  assert.equal(read(root, 'compose.yml'), 'services:\n  db: {}\n');
  assert.deepEqual(JSON.parse(read(root, 'package.json')), {
    name: 'x',
    scripts: { build: 'b' },
    dependencies: { keep: '1' },
  });
  assert.deepEqual(JSON.parse(read(root, 'caps.json')), { enabled: ['a', 'b'] });
  assert.deepEqual(JSON.parse(read(root, 'allow.json')), { RULE: { 'src/other.ts :: GET /y': 'r' } });

  const { present } = featurePresence(root, MANIFEST);
  assert.deepEqual(present, { paths: [], markers: [], jsonEntries: [], allowlistKeys: [] });
});

test('--remove is safe to run twice', () => {
  const root = fixture();
  removeFeature(root, MANIFEST);
  const snapshot = ['src/glue/index.ts', 'package.json', 'caps.json', 'allow.json'].map((f) => read(root, f));
  assert.deepEqual(removeFeature(root, MANIFEST), []);
  assert.deepEqual(
    ['src/glue/index.ts', 'package.json', 'caps.json', 'allow.json'].map((f) => read(root, f)),
    snapshot,
  );
});

test('--dry-run reports and writes nothing', () => {
  const root = fixture();
  const before = read(root, 'src/glue/index.ts');
  const actions = removeFeature(root, MANIFEST, { dryRun: true });
  assert.ok(actions.some((a) => a === 'would delete src/demo'));
  assert.ok(actions.some((a) => a.startsWith('would strip 2 block(s) in src/glue/index.ts')));
  assert.equal(read(root, 'src/glue/index.ts'), before);
  assert.equal(fs.existsSync(path.join(root, 'src/demo/a.ts')), true);
  assert.equal(featurePresence(root, MANIFEST).missing.paths.join(), 'missing.txt');
});

test('an unbalanced block stops the run before anything is deleted', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n<!-- feature:demo:start -->\ny\n');
  assert.throws(() => removeFeature(root, MANIFEST), /README\.md:2: "feature:demo:start" is never closed/);
  assert.equal(fs.existsSync(path.join(root, 'src/demo/a.ts')), true);
  assert.throws(() => findMarkerBlocks('// feature:demo:end\n', 'demo'), /without a "feature:demo:start"/);
  assert.throws(
    () => findMarkerBlocks('// feature:demo:start\n// feature:demo:start\n', 'demo'),
    /inside an open block/,
  );
});

test('only a comment line is a marker; prose that quotes the token is not', () => {
  const text = [
    'Wrap it in `feature:demo:start` and `feature:demo:end` comments.',
    '  {/* feature:demo:start */}',
    '  <Demo />',
    '  {/* feature:demo:end */}',
    '/* feature:demo:start */',
    'x',
    '/* feature:demo:end */',
    '',
  ].join('\n');
  assert.deepEqual(findMarkerBlocks(text, 'demo'), [
    [1, 3],
    [4, 6],
  ]);
});

test('markers of another feature are left alone', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, '.env.example'), '# feature:other:start\nO=1\n# feature:other:end\n');
  removeFeature(root, MANIFEST);
  assert.equal(read(root, '.env.example'), '# feature:other:start\nO=1\n# feature:other:end\n');
});

test('--list prints each block and allowlist entry', () => {
  const root = fixture();
  const text = listFeature(root, MANIFEST);
  assert.match(text, /src\/glue\/index\.ts:2-4/);
  assert.match(text, /\| DEMO_KEY=/);
  assert.match(text, /RULE → src\/demo\/x\.ts :: GET \/x: "r"/);
  assert.match(text, /scripts" → "demo:dev"   = "d"/);
});

test('loadManifest takes the name from the file and refuses an unknown key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-feature-manifests-'));
  fs.writeFileSync(path.join(dir, 'demo.json'), JSON.stringify({ paths: ['a'] }));
  fs.writeFileSync(path.join(dir, 'demo.residue.json'), '[]');
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ path: ['a'] }));
  assert.deepEqual(listFeatureNames(dir), ['bad', 'demo']);
  assert.deepEqual(loadManifest('demo', dir), {
    name: 'demo',
    paths: ['a'],
    markers: [],
    jsonEntries: [],
    allowlistPrefixes: [],
  });
  assert.throws(() => loadManifest('bad', dir), /unknown key "path"/);
  assert.throws(() => loadManifest('nope', dir), /No manifest for feature "nope"/);
});

test('the shipped manifests load, and every block they name is balanced in this repo', () => {
  const root = path.resolve(HERE, '..', '..');
  for (const name of listFeatureNames()) {
    const manifest = loadManifest(name);
    assert.doesNotThrow(() => featurePresence(root, manifest));
  }
});

test('the CLI refuses an unknown feature and prints usage without an action', () => {
  const cli = path.join(HERE, 'apply-feature.mjs');
  assert.throws(
    () => execFileSync(process.execPath, [cli, '--list', 'nope'], { stdio: 'pipe' }),
    (e) => /No manifest for feature "nope"/.test(String(e.stderr)),
  );
  assert.throws(
    () => execFileSync(process.execPath, [cli], { stdio: 'pipe' }),
    (e) => /Usage:/.test(String(e.stdout)),
  );
});
