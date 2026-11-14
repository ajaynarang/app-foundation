import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { templateResidue } from './check-scaffold-observability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('a template name left anywhere under the catalog is reported with its file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-residue-'));
  try {
    const catalog = path.join(dir, 'infra/observability/grafana-cloud/dashboards');
    fs.mkdirSync(catalog, { recursive: true });
    fs.writeFileSync(path.join(catalog, 'a.json'), '{"expr":"{service=\\"app-backend\\"}"}');
    fs.writeFileSync(path.join(catalog, 'b.json'), '{"name":"acme-production-rds-postgres"}');
    assert.deepEqual(templateResidue(dir), ['infra/observability/grafana-cloud/dashboards/a.json :: app-backend']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('init-app on a copy renames and regenerates the catalog, and it validates', () => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'check-scaffold-observability.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /check-scaffold-observability: PASS/);
});
