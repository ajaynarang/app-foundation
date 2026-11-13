import * as fs from 'fs';
import * as path from 'path';
import { ADDON_FEATURE_KEYS, FEATURE_KEYS } from '@app/shared-types';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Every plan feature key is enforced somewhere, or says why not (design item 17). A key is covered when some
 * production file names it in `@RequireFeature` (a route), `@RequiresPlanFeature` (an AI tool), or an `assertFeature`
 * / `hasFeature` call (a job, handler or channel). Otherwise it sits on DISPLAY_ONLY with a reason. A key sold on the
 * pricing page that nothing checks is a feature every plan gets for free.
 */
const REPO = path.resolve(__dirname, '../../../..');
const BACKEND_SRC = path.resolve(__dirname, '..');
const ROOTS = [BACKEND_SRC, path.join(REPO, 'packages/appshore/platform/src')];

/** Keys that are shown on the plan page and enforced nowhere, each with its reason. Remove an entry once it is gated. */
const DISPLAY_ONLY: Record<string, string> = {
  [FEATURE_KEYS.TEAM_MANAGEMENT]:
    'Enabled on every plan; how many people a workspace may have is the seat limit (PlanConfig.userLimit), checked where a seat is added.',
  [FEATURE_KEYS.AI_CHAT]:
    'Enabled on every plan; chat spend is bounded by the per-tenant AI budget, not a plan gate. A product that sells chat by plan gates the chat controller.',
  [FEATURE_KEYS.AUDIT_LOG]:
    'The template ships no audit-log route to gate yet; the product that builds one gates it with @RequireFeature(FEATURE_KEYS.AUDIT_LOG).',
};

const byConstName = new Map<string, string>(Object.entries(FEATURE_KEYS));

/** The feature value an argument names: `FEATURE_KEYS.X` or a string literal. */
function featureOf(arg: string): string | undefined {
  const trimmed = arg.trim();
  const constant = trimmed.match(/^FEATURE_KEYS\.(\w+)$/);
  if (constant) return byConstName.get(constant[1]);
  const literal = trimmed.match(/^(['"`])([^'"`]+)\1$/);
  return literal?.[2];
}

function enforcedKeys(): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /@RequireFeature\(\s*([^)]+?)\s*\)/g,
    /@RequiresPlanFeature\(\s*([^)]+?)\s*\)/g,
    /\b(?:assertFeature|hasFeature)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*([^,)]+)/g,
  ];
  for (const root of ROOTS) {
    for (const file of listSourceFiles(root)) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const pattern of patterns) {
        for (const m of text.matchAll(pattern)) {
          const key = featureOf(m[1]);
          if (key) found.add(key);
        }
      }
    }
  }
  return found;
}

/** A product scaffolded without Desk has no Desk routes; its key is then covered by absence. */
const deskRemoved = () => !fs.existsSync(path.join(BACKEND_SRC, 'domains/desk'));

describe('feature-key coverage', () => {
  const enforced = enforcedKeys();

  it.each(Object.values(FEATURE_KEYS))('%s is enforced somewhere or is display-only with a reason', (key) => {
    if (key === FEATURE_KEYS.DESK && deskRemoved()) return;
    const covered = enforced.has(key) || Boolean(DISPLAY_ONLY[key]?.trim());
    expect([key, covered]).toEqual([key, true]);
  });

  it('keeps the display-only list honest: a key that is now enforced comes off it', () => {
    expect(Object.keys(DISPLAY_ONLY).filter((key) => enforced.has(key))).toEqual([]);
  });

  it('every add-on feature key has an add-on catalog row (today the set is empty)', () => {
    const catalog = fs.readFileSync(path.join(REPO, 'packages/appshore/db/prisma/seeds/06-add-ons.seed.ts'), 'utf8');
    const missing = [...ADDON_FEATURE_KEYS].filter((key) => !catalog.includes(`featureKey: '${key}'`));
    expect(missing).toEqual([]);
  });

  it('every plan feature key has an entitlement row on each of the four plans', () => {
    const seed = fs.readFileSync(
      path.join(REPO, 'packages/appshore/db/prisma/seeds/04-plan-entitlements.seed.ts'),
      'utf8',
    );
    const short: string[] = [];
    for (const key of Object.values(FEATURE_KEYS)) {
      if (key === FEATURE_KEYS.DESK && deskRemoved()) continue;
      const rows = seed.match(new RegExp(`feature: '${key}'`, 'g'))?.length ?? 0;
      if (rows !== 4) short.push(`${key}: ${rows}`);
    }
    expect(short).toEqual([]);
  });
});
