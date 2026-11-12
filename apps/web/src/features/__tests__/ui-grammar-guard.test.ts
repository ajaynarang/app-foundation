/* global describe, it, expect */
/**
 * UI grammar guard: the rules a reviewer keeps missing, held by a test. It has no baseline: a new screen passes it
 * or the push fails.
 *  1. The same status label wears the same tone on every screen, and the common status words wear the tone the
 *     grammar gives them (Active = info, Paid = success, Failed = danger, …).
 *  2. No web source writes a raw Tailwind palette colour or a raw hex colour: a status wears a tone, a surface a
 *     theme token. Settings and admin screens also write no `*_VARIANTS` map of class strings and no bare relative
 *     time.
 *  3. Row actions go through `RowActions`; a status never rides a raw `Badge`; a control hidden until hover also
 *     shows on focus and on touch.
 *  4. Tinted text wears the `*-text` token, never the fill hue. (The contrast of every token pair is measured in
 *     `shared/components/page-chrome/__tests__/theme-tokens.test.ts`, which the pre-push hook runs beside this.)
 *  5. Every settings and admin page renders `PageHeader`; no hand-rolled h1 / h2, no spinner as a loading state, no
 *     raw fetch with a hand-built bearer token.
 *  6. States: an `Alert` is never an empty state or a read's error state, and a list that reads a query renders
 *     `ListErrorState`, so a failed fetch never reads as empty.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { StatusTone, StatusVariant } from '@app/ui/components/ui/status-tone';
import {
  INVOICE_STATUS_VARIANTS,
  SUBSCRIPTION_STATUS_VARIANTS,
  TENANT_PLAN_VARIANTS,
  TRANSACTION_TYPE_VARIANTS,
} from '@/features/billing/constants';
import { DELIVERY_STATUS_VARIANTS, SUBSCRIPTION_STATE_VARIANTS } from '@/features/webhooks/constants';
import { TENANT_STATUS_VARIANTS } from '@/features/platform/admin/constants';
import { INVOCATION_STATUS_VARIANTS } from '@/features/admin/ai-spend/constants';
import { INVITATION_STATUS_VARIANTS, MEMBER_STATE_VARIANTS } from '@/features/platform/settings/constants';
import { CREDENTIAL_STATUS_VARIANTS, HITL_TIER_VARIANTS } from '@/features/ai/agent-scope-ui/utils/scope-copy';
import { AI_CREDENTIAL_STATUS_VARIANTS } from '@/features/platform/ai-settings/constants';

const STATUS_MAPS: Record<string, Record<string, StatusVariant | null>> = {
  'billing.INVOICE_STATUS_VARIANTS': INVOICE_STATUS_VARIANTS,
  'billing.SUBSCRIPTION_STATUS_VARIANTS': SUBSCRIPTION_STATUS_VARIANTS,
  'billing.TRANSACTION_TYPE_VARIANTS': TRANSACTION_TYPE_VARIANTS,
  'billing.TENANT_PLAN_VARIANTS': TENANT_PLAN_VARIANTS,
  'webhooks.DELIVERY_STATUS_VARIANTS': DELIVERY_STATUS_VARIANTS,
  'webhooks.SUBSCRIPTION_STATE_VARIANTS': SUBSCRIPTION_STATE_VARIANTS,
  'admin.TENANT_STATUS_VARIANTS': TENANT_STATUS_VARIANTS,
  'aiSpend.INVOCATION_STATUS_VARIANTS': INVOCATION_STATUS_VARIANTS,
  'settings.INVITATION_STATUS_VARIANTS': INVITATION_STATUS_VARIANTS,
  'settings.MEMBER_STATE_VARIANTS': MEMBER_STATE_VARIANTS,
  'agentScope.CREDENTIAL_STATUS_VARIANTS': CREDENTIAL_STATUS_VARIANTS,
  'agentScope.HITL_TIER_VARIANTS': HITL_TIER_VARIANTS,
  'aiSettings.AI_CREDENTIAL_STATUS_VARIANTS': AI_CREDENTIAL_STATUS_VARIANTS,
};

/** The tone meanings of the status grammar: a status with one of these labels must wear this tone. */
const CANONICAL_TONES: Record<string, StatusTone> = {
  Draft: 'neutral',
  Pending: 'neutral',
  Active: 'info',
  Running: 'info',
  Trialing: 'info',
  'Pending approval': 'warning',
  'Past due': 'warning',
  Unpaid: 'warning',
  Paused: 'warning',
  Paid: 'success',
  Delivered: 'success',
  Succeeded: 'success',
  Accepted: 'success',
  Failed: 'danger',
  Rejected: 'danger',
  Cancelled: 'danger',
  Suspended: 'danger',
  Revoked: 'danger',
  Expired: 'muted',
  Inactive: 'muted',
  Void: 'muted',
  Archived: 'muted',
};

/** Labels that are spelled the same but mean different things: each needs a reason, or it is a bug. */
const SAME_LABEL_DIFFERENT_MEANING = new Set<string>();

function entries(): Array<{ map: string; label: string; tone: StatusTone }> {
  return Object.entries(STATUS_MAPS).flatMap(([map, variants]) =>
    Object.values(variants)
      .filter((variant): variant is StatusVariant => variant != null)
      .map((variant) => ({ map, label: variant.label, tone: variant.tone })),
  );
}

describe('status tones: one meaning, one tone', () => {
  it.each(Object.entries(CANONICAL_TONES))('every "%s" status wears the %s tone', (label, tone) => {
    const offenders = entries().filter((entry) => entry.label === label && entry.tone !== tone);
    expect(offenders).toEqual([]);
  });

  it('the same label wears the same tone on every screen', () => {
    const byLabel = new Map<string, Set<string>>();
    for (const entry of entries()) {
      if (SAME_LABEL_DIFFERENT_MEANING.has(entry.label)) continue;
      const tones = byLabel.get(entry.label) ?? new Set<string>();
      tones.add(`${entry.tone} (${entry.map})`);
      byLabel.set(entry.label, tones);
    }
    const conflicts = [...byLabel.entries()]
      .filter(([, tones]) => new Set([...tones].map((t) => t.split(' ')[0])).size > 1)
      .map(([label, tones]) => `${label}: ${[...tones].join(', ')}`);
    expect(conflicts).toEqual([]);
  });

  it('the canonical words actually appear, so the check above is not vacuous', () => {
    const labels = new Set(entries().map((entry) => entry.label));
    for (const label of ['Active', 'Pending', 'Paid', 'Failed', 'Cancelled', 'Expired', 'Draft']) {
      expect({ label, present: labels.has(label) }).toEqual({ label, present: true });
    }
  });
});

const FEATURES_ROOT = join(__dirname, '..');
const WEB_SRC = join(FEATURES_ROOT, '..');
const REPO_ROOT = join(WEB_SRC, '../../..');

type Source = { path: string; text: string };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

function read(paths: string[], root: string): Source[] {
  return paths.map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));
}

/**
 * Settings and admin: every page under app/settings and app/admin, and the features those pages render. A product
 * adds its own feature folders here as it builds them.
 */
const SETTINGS_ADMIN_DIRS = [
  '../app/settings',
  '../app/admin',
  'admin',
  'billing',
  'webhooks',
  'notifications',
  'ai/agent-activity',
  'ai/agent-detail-sheet',
  'ai/agent-scope-ui',
  'platform/admin',
  'platform/ai-settings',
  'platform/api-keys',
  'platform/billing',
  'platform/feature-flags',
  'platform/integrations',
  'platform/oauth-clients',
  'platform/settings',
];

const SETTINGS_ADMIN_SOURCES = read(
  SETTINGS_ADMIN_DIRS.flatMap((dir) => sourceFiles(join(FEATURES_ROOT, dir))),
  FEATURES_ROOT,
);

/** Every web source file: for the rules that hold app-wide. */
const APP_SOURCES = read(sourceFiles(WEB_SRC), FEATURES_ROOT);

/**
 * The shared packages every screen renders through: the @app/ui components (page chrome, tones, the shadcn set)
 * and web-core (the list kit, the semantic colour tokens). Held to the same theme rules as the screens.
 */
const KIT_DIRS = ['packages/ui/src', 'packages/appshore/web-core/src'];
const KIT_SOURCES = read(
  KIT_DIRS.flatMap((dir) => sourceFiles(join(REPO_ROOT, dir))),
  REPO_ROOT,
);

/** A raw Tailwind palette colour class: a status wears a tone, a surface a theme token. */
const PALETTE =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide)(?:-[trblxy])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const HEX_CLASS = /-\[#[0-9a-fA-F]{3,8}\]/;

function offending(pattern: RegExp, sources: Source[]): string[] {
  return sources.flatMap(({ path, text }) =>
    text
      .split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, index }) => `${path}:${index + 1}: ${line.trim()}`),
  );
}

describe('the web app speaks only in theme tokens and shared components', () => {
  it('scans real files', () => {
    expect(APP_SOURCES.length).toBeGreaterThan(250);
    expect(SETTINGS_ADMIN_SOURCES.length).toBeGreaterThan(60);
  });

  it('the patterns catch what they describe (fixtures)', () => {
    const fixture = (text: string) => [{ path: 'fixture.tsx', text }];
    expect(offending(PALETTE, fixture('className="text-red-500"'))).toHaveLength(1);
    expect(offending(PALETTE, fixture('className="dark:hover:bg-gray-800/50"'))).toHaveLength(1);
    expect(offending(PALETTE, fixture('className="text-critical-text bg-muted/40"'))).toEqual([]);
    expect(offending(HEX_CLASS, fixture('className="bg-[#1a2b3c]"'))).toHaveLength(1);
  });

  it('no raw Tailwind palette colour class anywhere in the web app', () => {
    expect(offending(PALETTE, APP_SOURCES)).toEqual([]);
  });

  it('no raw hex colour in a class anywhere in the web app', () => {
    expect(offending(HEX_CLASS, APP_SOURCES)).toEqual([]);
  });

  it('the shared packages (@app/ui, web-core) use no raw palette class or hex colour either', () => {
    expect(KIT_SOURCES.some(({ path }) => path.endsWith('page-chrome/row-actions.tsx'))).toBe(true);
    expect(KIT_SOURCES.some(({ path }) => path.endsWith('shared/list/use-cursor-list.ts'))).toBe(true);
    expect(offending(PALETTE, KIT_SOURCES)).toEqual([]);
    expect(offending(HEX_CLASS, KIT_SOURCES)).toEqual([]);
  });

  it('no `*_VARIANTS` map of class strings: a status maps to a tone', () => {
    expect(offending(/_VARIANTS\s*:\s*Record<[^>]+,\s*string>/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('no bare relative time: RelativeTime carries the full timestamp on hover', () => {
    expect(offending(/\bformatRelativeTime\(|\btimeAgo\(|\bformatDistanceToNow\(/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('tinted text wears the *-text token, never the fill hue (1.7–2.8:1 in light theme), in the app and the packages', () => {
    const fillAsText = /\btext-(?:caution|success|info|critical)(?![-\w])/;
    expect(offending(fillAsText, [{ path: 'fixture.tsx', text: 'hover:text-caution text-info/80' }])).toHaveLength(1);
    expect(offending(fillAsText, [{ path: 'fixture.tsx', text: 'text-caution-text bg-caution/15' }])).toEqual([]);
    expect(offending(fillAsText, APP_SOURCES)).toEqual([]);
    expect(offending(fillAsText, KIT_SOURCES)).toEqual([]);
  });
});

/**
 * A list row (`<li>`) or a table cell holding a `<Button>` is the "row of Buttons" anti-pattern: its actions go through
 * `<RowActions>`, which renders the buttons itself. Allowed only where the button IS the row or is not an action at
 * all, each with its reason.
 */
const ROW_BUTTON_ALLOWED: Record<string, string> = {};

function rawRowButtons(sources: Source[]): string[] {
  return sources
    .filter(({ path }) => path.endsWith('.tsx') && !(path in ROW_BUTTON_ALLOWED))
    .flatMap(({ path, text }) =>
      [
        ['<li', '</li>'],
        ['<TableCell', '</TableCell>'],
      ].flatMap(([open, close]) => {
        const hits: string[] = [];
        for (let at = text.indexOf(open); at !== -1; at = text.indexOf(open, at + open.length)) {
          const end = text.indexOf(close, at);
          if (end === -1) break;
          if (/<Button\b/.test(text.slice(at, end)))
            hits.push(`${path}:${text.slice(0, at).split('\n').length} ${open}`);
        }
        return hits;
      }),
    );
}

describe('row actions go through RowActions', () => {
  it('the check catches what it describes (fixture)', () => {
    const fixture = (text: string) => [{ path: 'fixture.tsx', text }];
    expect(rawRowButtons(fixture('<TableCell><Button onClick={x}>Revoke</Button></TableCell>'))).toHaveLength(1);
    expect(rawRowButtons(fixture('<TableCell><RowActions primary={{ label: "Open" }} /></TableCell>'))).toEqual([]);
  });

  it('no raw <Button> inside a list row or a table cell on a settings or admin screen', () => {
    expect(rawRowButtons(SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('the allow-list only names files that still exist', () => {
    const paths = new Set(SETTINGS_ADMIN_SOURCES.map(({ path }) => path));
    expect(Object.keys(ROW_BUTTON_ALLOWED).filter((path) => !paths.has(path))).toEqual([]);
  });

  it('no hand-rolled chip with muted text on a muted fill: a chip wears a tone', () => {
    // bg-muted (or ≥ 60 % of it) under text-muted-foreground reads 4.36:1 in light theme; bg-muted/50 and lighter pass.
    const mutedFill = String.raw`bg-muted(?:\/[6-9]\d)?(?![\w/-])`;
    const sameClassString = new RegExp(
      String.raw`${mutedFill}[^'"\x60]*text-muted-foreground|text-muted-foreground[^'"\x60]*${mutedFill}`,
    );
    expect(offending(sameClassString, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('a lone destructive row action is an outline in critical-text, never the filled destructive pair', () => {
    const rowActions = KIT_SOURCES.find(({ path }) => path.endsWith('page-chrome/row-actions.tsx'));
    expect(rowActions?.text).toContain('text-critical-text');
    expect(rowActions?.text).not.toMatch(/(?<![-\w])variant="destructive"/);
  });

  it('a status never rides a raw Badge: no variant keyed on a status, no raw enum text in a Badge', () => {
    // `<Badge variant={x.status === 'PAID' ? …}>` or `<Badge …>{x.status}</Badge>`: a per-screen colour and the raw
    // enum ("PAID", "PAST_DUE") on screen. A status is `<StatusBadge tone={MAP[x.status].tone}>{MAP[x.status].label}`.
    const variantOnStatus = offending(/<Badge\b[^>]*variant=\{[^}]*\bstatus/i, SETTINGS_ADMIN_SOURCES);
    const rawStatusChild = SETTINGS_ADMIN_SOURCES.flatMap(({ path, text }) =>
      [...text.matchAll(/<Badge\b[^>]*>\s*\{[\w.?!]*\bstatus\}\s*<\/Badge>/g)].map(
        (match) => `${path}:${text.slice(0, match.index).split('\n').length}`,
      ),
    );
    expect([...variantOnStatus, ...rawStatusChild]).toEqual([]);
  });

  it('no Badge in the muted variant (bg-muted + text-muted-foreground): a chip is a StatusBadge with a tone', () => {
    expect(offending(/variant="muted"/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('a control hidden until hover also shows on focus and on touch, never hover-only', () => {
    // A touch screen has no hover, so `opacity-0` revealed by `group-hover` alone is a control a phone can never
    // reach. RowActions does this itself.
    const hoverOnly = offending(/opacity-0[^"`]*group-hover:opacity-100/, APP_SOURCES).filter(
      (hit) =>
        !hit.includes('[@media(hover:none)]:opacity-100') ||
        !/(focus-visible|group-focus-within):opacity-100/.test(hit),
    );
    expect(hoverOnly).toEqual([]);
  });
});

describe('settings and admin pages wear the shared chrome', () => {
  it('scans the settings and admin pages', () => {
    expect(SETTINGS_ADMIN_SOURCES.some(({ path }) => path.endsWith('app/settings/usage/page.tsx'))).toBe(true);
    expect(SETTINGS_ADMIN_SOURCES.some(({ path }) => path.endsWith('app/admin/tenants/page.tsx'))).toBe(true);
  });

  it('no hand-rolled page or section heading: PageHeader (h1) and PageSection (h2) render them', () => {
    expect(offending(/<h[12][\s>]/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('no spinner as a loading state: a shaped PageLoadingSkeleton (buttons take `loading`)', () => {
    expect(offending(/\bLoader2\b/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });

  it('every settings / admin page renders a PageHeader', () => {
    const pages = SETTINGS_ADMIN_SOURCES.filter(({ path }) => /app\/(settings|admin)\/.+\/page\.tsx$/.test(path));
    expect(pages.length).toBeGreaterThanOrEqual(16);
    // Pages that hand their whole body to a feature component, which renders the header.
    const delegated: Record<string, string> = {
      '../app/admin/ai-spend/page.tsx': 'admin/ai-spend/components/AiSpendPage.tsx',
      '../app/admin/timers/page.tsx': 'admin/timers/components/TimersPage.tsx',
      '../app/settings/ai/page.tsx': 'platform/ai-settings/components/ai-settings-page.tsx',
    };
    const missing = pages
      .filter(({ path, text }) => !text.includes('<PageHeader') && !(path in delegated))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
    for (const target of Object.values(delegated)) {
      const source = SETTINGS_ADMIN_SOURCES.find(({ path }) => path === target);
      expect({ target, header: source?.text.includes('<PageHeader') }).toEqual({ target, header: true });
    }
  });

  it('no raw fetch with a hand-built bearer token: apiClient carries auth and refresh', () => {
    expect(offending(/Authorization:\s*`Bearer/, SETTINGS_ADMIN_SOURCES)).toEqual([]);
  });
});

/**
 * States: an `Alert` whose copy is empty-state copy ("No keys yet", "Nothing here"), or that is the branch of an
 * emptiness test (`.length === 0 ?`) or of a query's `isError`, should be `PageEmptyState` / `ListErrorState`. A
 * form's own error (`{error && <Alert>}`) and a warning banner are not states and pass. A file that renders a list
 * surface (`ListFooter`, `ListRows`, `ListCardGrid`, `TableBody`) and reads `isLoading` renders `ListErrorState`
 * too; a file whose list is fed by a parent that owns the error branch goes in `LIST_ERROR_STATE_ALLOWED`.
 */
const EMPTY_STATE_COPY =
  /\b(?:No\s+[\w' ]{0,40}?\b(?:yet|found|match(?:es)?)\b|Nothing\b|is empty\b|There (?:are|is) no\b)/i;
const STATE_BRANCH = /(?:\.length\s*===\s*0|!\s*[\w.?]+\.length|\bisEmpty\b|\bisError\b)\s*\)?\s*(?:\?|&&)\s*\(?\s*$/;

function alertsAsStates(sources: Source[]): string[] {
  return sources
    .filter(({ path }) => path.endsWith('.tsx'))
    .flatMap(({ path, text }) =>
      [...text.matchAll(/<Alert(?=[\s>])/g)]
        .filter((match) => {
          const at = match.index ?? 0;
          const end = text.indexOf('</Alert>', at);
          const block = text.slice(at, end === -1 ? undefined : end);
          return EMPTY_STATE_COPY.test(block) || STATE_BRANCH.test(text.slice(Math.max(0, at - 160), at));
        })
        .map((match) => `${path}:${text.slice(0, match.index).split('\n').length}`),
    );
}

const LIST_SURFACE = /<(?:ListFooter|ListRows|ListCardGrid|TableBody)\b/;
const LIST_ERROR_STATE_ALLOWED: Record<string, string> = {};

function listsWithoutErrorState(sources: Source[]): string[] {
  return sources
    .filter(({ path, text }) => path.endsWith('.tsx') && LIST_SURFACE.test(text) && /\bisLoading\b/.test(text))
    .filter(({ path, text }) => !text.includes('ListErrorState') && !(path in LIST_ERROR_STATE_ALLOWED))
    .map(({ path }) => path);
}

describe('states: an Alert is never an empty or error state; a list that reads a query has its error state', () => {
  it('the checks catch what they describe (fixtures), and pass a form error and a warning banner', () => {
    const fixture = (text: string) => [{ path: 'fixture.tsx', text }];
    expect(
      alertsAsStates(
        fixture(
          '{keys.length === 0 ? (\n  <Alert>\n    <AlertDescription>Keys</AlertDescription>\n  </Alert>\n) : null}',
        ),
      ),
    ).toHaveLength(1);
    expect(
      alertsAsStates(fixture('<Alert><AlertDescription>No API keys yet.</AlertDescription></Alert>')),
    ).toHaveLength(1);
    expect(
      alertsAsStates(fixture('{keys.isError && (\n  <Alert variant="destructive">Failed</Alert>\n)}')),
    ).toHaveLength(1);
    expect(
      alertsAsStates(
        fixture('{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}'),
      ),
    ).toEqual([]);
    expect(
      alertsAsStates(fixture('<Alert><AlertDescription>Store this secret securely.</AlertDescription></Alert>')),
    ).toEqual([]);
    expect(
      alertsAsStates(fixture('<AlertDialog open><AlertDialogTitle>Nothing to undo</AlertDialogTitle></AlertDialog>')),
    ).toEqual([]);

    const list = 'if (keys.isLoading) return <Skeleton />;\n<Table><TableBody>{rows}</TableBody></Table>';
    expect(listsWithoutErrorState(fixture(list))).toEqual(['fixture.tsx']);
    expect(listsWithoutErrorState(fixture(`${list}\n<ListErrorState title="x" onRetry={r} />`))).toEqual([]);
  });

  it('scans the web app, lists included', () => {
    expect(APP_SOURCES.filter(({ text }) => LIST_SURFACE.test(text)).length).toBeGreaterThan(8);
  });

  it("no Alert used as an empty state or as a read's error state: PageEmptyState / ListErrorState", () => {
    expect(alertsAsStates(APP_SOURCES)).toEqual([]);
  });

  it('every list that reads a query renders ListErrorState', () => {
    expect(listsWithoutErrorState(APP_SOURCES)).toEqual([]);
  });

  it('the allow-list only names files that still exist', () => {
    const paths = new Set(APP_SOURCES.map(({ path }) => path));
    expect(Object.keys(LIST_ERROR_STATE_ALLOWED).filter((path) => !paths.has(path))).toEqual([]);
  });
});
