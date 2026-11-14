import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  type FeatureManifest,
  FEATURES_DIR_REL,
  SEAM_DIR_REL,
  footprintProblems,
  importsOutsideSeam,
  isKept,
  keptFeatures,
  listManifests,
  textFiles,
  unregisteredMarkerFiles,
} from './optional-features.scan';

/**
 * Optional features (ADR "Optional features: Desk is opt-in at scaffold time").
 *
 * A feature a product chooses at scaffold time is wired only through `apps/backend/src/platform-glue/features/`:
 * `<name>.feature.ts` is the one file outside the feature's folder that imports its code, and `index.ts` lists what
 * the product kept. That list is the only record of the choice. Everything else the feature brings outside its
 * folder is named in its manifest, `tools/init-app/features/<name>.json`, which `apply-feature.mjs` strips.
 *
 * A feature with no backend seam (mobile) says where it lives instead: its manifest's `presentWhen` path. It counts as
 * kept while that path exists, and `OPTIONAL_FEATURES` does not list it. Either way the state is read from the tree.
 *
 * - A kept feature: every path, marked block, JSON entry and allowlist file of its manifest exists.
 * - A dropped feature: none of its paths exist and no marked block, JSON entry or allowlist key of it remains.
 * - Either way: no backend file imports the feature's code outside the seam, and every file with a marker of the
 *   feature is listed in the manifest, so `apply-feature.mjs --remove` reaches it.
 *
 * The scaffold itself (`init-app --desk no`, then install, type-check and test) is checked by
 * `pnpm verify:scaffold` (tools/init-app/check-variants.mjs), which takes minutes and so is not in the hook.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('optional features', () => {
  const manifests = listManifests(REPO_ROOT);
  const kept = keptFeatures(REPO_ROOT);
  const files = textFiles(REPO_ROOT);

  it('finds the Desk and mobile manifests, and the template itself keeps both', () => {
    expect(manifests.map((m) => m.name)).toEqual(expect.arrayContaining(['desk', 'mobile']));
    expect(manifests.find((m) => m.name === 'mobile')?.presentWhen).toBe('apps/mobile');
    // Split so init-app's rename leaves it alone: a scaffolded product may have said no.
    const templateName = ['app', 'foundation'].join('-');
    const rootName = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { name: string })
      .name;
    if (rootName === templateName) {
      expect(kept).toContain('desk');
      expect(manifests.filter((m) => m.presentWhen).every((m) => isKept(REPO_ROOT, m, kept))).toBe(true);
    }
  });

  it('every kept feature has a manifest, and every seam file is listed in index.ts', () => {
    const seamed = new Set(manifests.filter((m) => !m.presentWhen).map((m) => m.name));
    expect(kept.filter((k) => !seamed.has(k))).toEqual([]);
    const seamFiles = fs
      .readdirSync(path.join(REPO_ROOT, SEAM_DIR_REL))
      .filter((f) => f.endsWith('.feature.ts'))
      .map((f) => f.slice(0, -'.feature.ts'.length));
    expect(seamFiles.filter((f) => !kept.includes(f))).toEqual([]);
  });

  it.each(manifests.map((m) => [m.name, m] as const))('%s: the footprint matches the choice in index.ts', (_, m) => {
    expect(footprintProblems(REPO_ROOT, m, isKept(REPO_ROOT, m, kept))).toEqual([]);
  });

  it.each(manifests.map((m) => [m.name, m] as const))('%s: no backend file imports it outside the seam', (_, m) => {
    expect(importsOutsideSeam(REPO_ROOT, m, files)).toEqual([]);
  });

  it.each(manifests.map((m) => [m.name, m] as const))('%s: every file with its marker is in the manifest', (_, m) => {
    expect(unregisteredMarkerFiles(REPO_ROOT, m, files)).toEqual([]);
  });

  describe('the checks catch drift (fixture repo)', () => {
    let root: string;
    const manifest: FeatureManifest = {
      name: 'demo',
      paths: ['apps/backend/src/domains/demo', `${SEAM_DIR_REL}/demo.feature.ts`],
      markers: ['apps/backend/.env.example'],
      jsonEntries: [{ file: 'package.json', path: ['scripts', 'demo:dev'] }],
      allowlistPrefixes: [{ prefix: 'apps/backend/src/domains/demo/', files: ['allow.json'] }],
    };
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'optional-features-'));
      write(`${FEATURES_DIR_REL}/demo.json`, JSON.stringify(manifest));
      write('apps/backend/src/domains/demo/demo.module.ts', 'export class DemoModule {}\n');
      write(`${SEAM_DIR_REL}/demo.feature.ts`, "import { DemoModule } from '../../domains/demo/demo.module';\n");
      write(`${SEAM_DIR_REL}/index.ts`, "import { DEMO } from './demo.feature';\n");
      write('apps/backend/.env.example', 'A=1\n# feature:demo:start\nDEMO=1\n# feature:demo:end\n');
      write('package.json', JSON.stringify({ scripts: { 'demo:dev': 'x' } }));
      write('allow.json', JSON.stringify({ R: { 'apps/backend/src/domains/demo/x.ts': 'why' } }));
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('a consistent kept feature passes', () => {
      expect(keptFeatures(root)).toEqual(['demo']);
      expect(footprintProblems(root, manifest, true)).toEqual([]);
      expect(importsOutsideSeam(root, manifest, textFiles(root))).toEqual([]);
      expect(unregisteredMarkerFiles(root, manifest, textFiles(root))).toEqual([]);
    });

    it('a kept feature with a missing path, block or JSON entry fails', () => {
      fs.rmSync(path.join(root, 'apps/backend/src/domains/demo'), { recursive: true });
      write('apps/backend/.env.example', 'A=1\n');
      write('package.json', '{}');
      expect(footprintProblems(root, manifest, true)).toEqual([
        'kept "demo": path apps/backend/src/domains/demo is missing',
        'kept "demo": apps/backend/.env.example holds no feature:demo block',
        'kept "demo": JSON entry package.json scripts → demo:dev is missing',
      ]);
    });

    it('a dropped feature that left a path, block, JSON entry or allowlist key behind fails', () => {
      expect(footprintProblems(root, manifest, false)).toEqual([
        'dropped "demo": path apps/backend/src/domains/demo still exists',
        `dropped "demo": path ${SEAM_DIR_REL}/demo.feature.ts still exists`,
        'dropped "demo": apps/backend/.env.example still holds 1 block(s)',
        'dropped "demo": JSON entry package.json scripts → demo:dev is still there',
        'dropped "demo": allow.json still holds "apps/backend/src/domains/demo/x.ts"',
      ]);
    });

    it('an unbalanced block fails', () => {
      write('apps/backend/.env.example', '# feature:demo:start\nDEMO=1\n');
      expect(footprintProblems(root, manifest, true)).toEqual([
        'apps/backend/.env.example: line 1: "feature:demo:start" is never closed',
      ]);
    });

    it('an import of the feature outside the seam fails, unless it sits in a registered block', () => {
      write('apps/backend/src/main.ts', "import { DemoModule } from './domains/demo/demo.module';\n");
      write(
        'apps/backend/scripts/seed.ts',
        "// feature:demo:start\nimport { DemoModule } from '../src/domains/demo/demo.module';\n// feature:demo:end\n",
      );
      // A block in a file the manifest does not list exempts nothing: apply-feature would never strip it.
      expect(importsOutsideSeam(root, manifest, textFiles(root))).toEqual([
        "apps/backend/scripts/seed.ts:2 -> '../src/domains/demo/demo.module'",
        "apps/backend/src/main.ts:1 -> './domains/demo/demo.module'",
      ]);
      expect(unregisteredMarkerFiles(root, manifest, textFiles(root))).toEqual(['apps/backend/scripts/seed.ts']);
      manifest.markers.push('apps/backend/scripts/seed.ts');
      try {
        expect(importsOutsideSeam(root, manifest, textFiles(root))).toEqual([
          "apps/backend/src/main.ts:1 -> './domains/demo/demo.module'",
        ]);
        expect(unregisteredMarkerFiles(root, manifest, textFiles(root))).toEqual([]);
      } finally {
        manifest.markers.pop();
      }
    });

    it('a manifest with presentWhen is kept while that path exists, whatever index.ts says', () => {
      const gadget: FeatureManifest = {
        ...manifest,
        name: 'gadget',
        presentWhen: 'apps/gadget',
        paths: ['apps/gadget'],
      };
      expect(isKept(root, gadget, keptFeatures(root))).toBe(false);
      write('apps/gadget/main.dart', 'void main() {}\n');
      expect(isKept(root, gadget, keptFeatures(root))).toBe(true);
      // Without the key, the seam decides: demo is imported in index.ts, so it is kept.
      expect(isKept(root, manifest, keptFeatures(root))).toBe(true);
      expect(isKept(root, { ...manifest, name: 'other' }, keptFeatures(root))).toBe(false);
    });

    it('presentWhen is read from the manifest file, and must be a repo-relative path', () => {
      // The fixture's demo.json carries its name, which a manifest file never does; drop it so only gadget is read.
      fs.rmSync(path.join(root, FEATURES_DIR_REL, 'demo.json'));
      write(`${FEATURES_DIR_REL}/gadget.json`, JSON.stringify({ presentWhen: 'apps/gadget', paths: ['apps/gadget'] }));
      expect(listManifests(root).find((m) => m.name === 'gadget')?.presentWhen).toBe('apps/gadget');
      write(`${FEATURES_DIR_REL}/gadget.json`, JSON.stringify({ presentWhen: ['apps/gadget'] }));
      expect(() => listManifests(root)).toThrow(/presentWhen must be a repo-relative path/);
    });

    it('prose that quotes the marker token is not a marker', () => {
      write('docs/notes.md', 'Wrap Desk lines in `feature:demo:start` and `feature:demo:end` comments.\n');
      expect(unregisteredMarkerFiles(root, manifest, textFiles(root))).toEqual([]);
    });
  });
});
