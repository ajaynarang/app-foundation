import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ADR "Outbox and deadlines": every domain event with a write behind it leaves through the transactional
 * outbox.
 *
 * A direct `DomainEventService.emit(...)` (or `.publish(event)`) after a commit can lose the event (a crash,
 * a deploy or an unreachable Redis between the commit and the emit), and a raw `EventEmitter2.emit(name,
 * new DomainEvent(...))` skips the durable path altogether. Code stages its events with
 * `OutboxService.transaction((tx, emit) => …)` (or `stage` + `publishStaged`) so an event exists if and only
 * if its change committed.
 *
 * `no-direct-emit.allowlist.json` is a short list of SIGNALS with no database write behind them, each with
 * its file, its count and a reason. The spec fails when any file emits directly beyond its allowance (new
 * code: move it to the outbox, do not allowlist it), when an allowance is larger than what the file still
 * does (stale: shrink or drop the entry), and when an entry has no reason. Adding an entry is a reviewed
 * decision: a signal with no write, never a change.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const ROOTS = [join(REPO, 'apps', 'backend', 'src'), join(REPO, 'packages', 'appshore', 'platform', 'src')];
const ALLOWLIST_PATH = join(__dirname, 'no-direct-emit.allowlist.json');

/** The outbox itself is the one place allowed to hand events to DomainEventService. */
const OUTBOX_FILES = /packages\/appshore\/platform\/src\/infrastructure\/events\/outbox[\w.-]*\.ts$/;

type Counts = Record<string, number>;
type Allowlist = Record<string, { count: number; reason: string }>;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__' || name === 'test') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Direct emits in one source: the names this file binds to DomainEventService (an injected
 * `events: DomainEventService`, or `const events = app.get(DomainEventService)`), then every
 * `[this.]<name>.emit(` or `.publish(` — including the multi-line `this.events\n  .emit(` form. A direct
 * `publish(event)` after a commit loses the event in the same gap as `emit`, so it counts the same. A
 * `new DomainEvent(` built outside the outbox is an envelope about to be handed to a bus directly
 * (`EventEmitter2.emit(name, new DomainEvent(…))`), so each one counts as a direct emit too.
 */
export function countDirectEmits(src: string): number {
  let count = [...src.matchAll(/\bnew\s+DomainEvent\s*(?:<[^>()]*>)?\s*\(/g)].length;
  if (!/\bDomainEventService\b/.test(src)) return count;
  const names = new Set<string>();
  for (const m of src.matchAll(/(\w+)\??\s*:\s*DomainEventService\b/g)) names.add(m[1]);
  for (const m of src.matchAll(/(\w+)\s*=\s*[\w.]+\.get\(\s*DomainEventService\s*\)/g)) names.add(m[1]);
  for (const name of names) {
    const call = new RegExp(
      `(?<![\\w$.])(?:this\\s*\\.\\s*)?${escape(name)}\\s*\\.\\s*(?:emit|publish)\\s*(?:<[^>()]*>)?\\s*\\(`,
      'g',
    );
    count += [...src.matchAll(call)].length;
  }
  return count;
}

const current: Counts = Object.fromEntries(
  ROOTS.flatMap((root) => walk(root))
    .map((file) => [relative(REPO, file), file] as const)
    .filter(([rel]) => !OUTBOX_FILES.test(rel))
    .map(([rel, file]) => [rel, countDirectEmits(readFileSync(file, 'utf8'))] as const)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b)),
);

const allowlist: Allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));

describe('every event through the outbox (allowlist)', () => {
  it('the scanner sees the allowlisted signals (sanity)', () => {
    expect(Object.keys(allowlist).length).toBeGreaterThan(0);
    for (const file of Object.keys(allowlist)) expect(current[file] ?? 0).toBeGreaterThan(0);
  });

  it('adds no direct emit — stage it through OutboxService', () => {
    const grown = Object.entries(current)
      .filter(([file, count]) => count > (allowlist[file]?.count ?? 0))
      .map(([file, count]) => `${file}: ${count} (allowed ${allowlist[file]?.count ?? 0})`);
    if (grown.length) {
      throw new Error(
        'ADR "Outbox and deadlines": emit inside the transaction with OutboxService.transaction((tx, emit) => …) ' +
          '(or stage + publishStaged) — a direct DomainEventService.emit after a commit can lose the event.\n' +
          `Direct emit(s) beyond the allowlist — move them to the outbox:\n  ${grown.join('\n  ')}`,
      );
    }
  });

  it('the allowlist holds only live counts (moved emits are removed)', () => {
    const stale = Object.entries(allowlist)
      .filter(([file, entry]) => (current[file] ?? 0) < entry.count)
      .map(([file, entry]) => `${file}: ${current[file] ?? 0} (allowed ${entry.count})`);
    if (stale.length) {
      throw new Error(`Moved to the outbox — shrink no-direct-emit.allowlist.json:\n  ${stale.join('\n  ')}`);
    }
  });

  it('every allowlisted emit says why it has no write behind it', () => {
    const unexplained = Object.entries(allowlist)
      .filter(([, entry]) => !Number.isInteger(entry.count) || entry.count < 1 || entry.reason.trim().length < 20)
      .map(([file]) => file);
    expect(unexplained).toEqual([]);
  });

  describe('countDirectEmits', () => {
    it('counts this.<name>.emit for an injected DomainEventService, across line breaks and generics', () => {
      const src = `
        constructor(private readonly events: DomainEventService) {}
        a() { await this.events.emit(X, 1, {}); }
        b() { this.events
          .emit<Payload>(Y, 1, {}); }
        c() { this.emitter.emit('x'); other.events.emit(Z); }
      `;
      expect(countDirectEmits(src)).toBe(2);
    });

    it('counts a service fetched from the app context', () => {
      const src = `const events = app.get(DomainEventService);\nawait events\n  .emit(X, 1, {});`;
      expect(countDirectEmits(src)).toBe(1);
    });

    it('counts a direct publish(event) the same as an emit — both skip the outbox', () => {
      const src = `
        constructor(private readonly events: DomainEventService) {}
        a() { await this.events.publish(evt); }
        b() { await this.events.emit(X, 1, {}); }
        c() { this.bus.publish(evt); }
      `;
      expect(countDirectEmits(src)).toBe(2);
    });

    it('counts a DomainEvent built outside the outbox for a raw EventEmitter2 emit', () => {
      const src = `
        constructor(private readonly events: EventEmitter2) {}
        a() { this.events.emit(X, new DomainEvent(X, '1', {})); }
        b() { this.events.emit(Y, new DomainEvent<P>(Y, '1', {})); }
      `;
      expect(countDirectEmits(src)).toBe(2);
    });

    it('ignores files that never touch DomainEventService or build a DomainEvent', () => {
      expect(countDirectEmits('this.events.emit(X)')).toBe(0);
    });
  });
});
