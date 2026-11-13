import * as fs from 'fs';
import * as path from 'path';
import * as KERNEL_QUEUE from '@appshore/kernel/infrastructure/queue/queue.constants';
import * as WHATSAPP from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp.constants';
import { buildJobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import {
  ANY_EVENTS_JOB,
  FOUNDATION_JOB_CONTEXT,
  jobSystemReason,
  mergeJobContext,
} from '@appshore/kernel/infrastructure/rls/job-context-registry';
import { isSystemReason } from '@appshore/kernel/infrastructure/rls/system-reasons';
import { APP_JOB_NAMES, APP_JOB_VOCABULARY } from '../platform-glue/queue/job-names';
import { APP_SYSTEM_REASONS, JOB_CONTEXT } from '../platform-glue/queue/job-context';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Tenant-context coverage for jobs (design item 20). Every BullMQ job name a worker handles says how it gets its
 * tenant: from its payload (`tenant`), per tenant (`forEachTenant` with a reason), as a global sweep (`system` with a
 * reason), or not at all because it never touches a tenant table (`noDatabase`). The foundation declares its names in
 * `@appshore/kernel` (`job-context-registry.ts`), the app in `platform-glue/queue/job-context.ts`.
 *
 * This checks DECLARATIONS, not behaviour: that every handled name has an entry, and that each declared reason
 * appears at a `systemScope` / `forEachTenant` call. The handler specs (which read `currentRls()` inside the work) and
 * the `rls.*` log fields prove a job really runs that way.
 *
 * Job names are collected statically from every `QueueJobHandler` (`readonly jobNames = [...]`, the names the queue
 * dispatchers route by), plus the queues still served by their own `@Processor` (webhooks, the durable event bus).
 */

const SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC, '..', '..', '..');
const ROOTS = [
  SRC,
  path.join(REPO_ROOT, 'packages', 'appshore', 'platform', 'src'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'kernel', 'src'),
];
const KERNEL_RLS_DIR = path.join(REPO_ROOT, 'packages', 'appshore', 'kernel', 'src', 'infrastructure', 'rls');
const APP_JOB_CONTEXT_FILE = path.join(SRC, 'platform-glue', 'queue', 'job-context.ts');

const sources = ROOTS.flatMap((root) => listSourceFiles(root)).map((file) => ({
  file,
  rel: path.relative(REPO_ROOT, file),
  text: stripComments(fs.readFileSync(file, 'utf8')),
}));

/** Constants a `jobNames` token may name: the kernel's `*_JOB_NAMES`, the app's `APP_JOB_NAMES`, the channel's. */
const NAMED: Record<string, unknown> = { ...KERNEL_QUEUE, ...WHATSAPP, APP_JOB_NAMES };

function lookup(expr: string): string | undefined {
  const value = expr
    .split('.')
    .reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], NAMED);
  return typeof value === 'string' ? value : undefined;
}

/** A token is a string literal, a constant path (`BULK_OPS_JOB_NAMES.X`), or a local `const` that is one of those. */
function resolveToken(token: string, text: string, rel: string, depth = 0): string {
  const literal = /^'([^']+)'$/.exec(token);
  if (literal) return literal[1];
  const named = lookup(token);
  if (named !== undefined) return named;
  const local = new RegExp(`\\bconst ${token}\\s*=\\s*([^;\\n]+);`).exec(text);
  if (local && depth < 3) return resolveToken(local[1].trim(), text, rel, depth + 1);
  throw new Error(`Cannot resolve job name token "${token}" in ${rel}`);
}

function handledJobNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const { rel, text } of sources) {
    for (const m of text.matchAll(/readonly jobNames\s*=\s*\[([\s\S]*?)\]/g)) {
      for (const raw of m[1].split(',')) {
        const token = raw.trim();
        if (token) names.set(resolveToken(token, text, rel), rel);
      }
    }
  }
  // Queues still served by their own @Processor, not a dispatcher.
  for (const name of Object.values(KERNEL_QUEUE.WEBHOOKS_JOB_NAMES)) names.set(name, 'webhooks/delivery.processor');
  names.set(ANY_EVENTS_JOB, 'events/durable-event.processor');
  return names;
}

/** `@Processor` classes the scan above accounts for: a dispatcher routes by `jobNames`, the rest are named here. */
const KNOWN_PROCESSORS = [
  'apps/backend/src/platform-glue/events/durable-event.processor.ts',
  'apps/backend/src/platform-glue/queue/dispatchers/bulk-ops-queue.processor.ts',
  'apps/backend/src/platform-glue/queue/dispatchers/notifications-queue.processor.ts',
  'apps/backend/src/platform-glue/queue/placeholder.processors.ts',
  'apps/backend/src/platform-glue/webhooks/delivery.processor.ts',
  'packages/appshore/platform/src/infrastructure/notifications/channels/whatsapp/whatsapp-queue.processor.ts',
];

describe('tenant-context coverage for jobs', () => {
  const handled = handledJobNames();

  it('finds the job handlers (sanity check on the scan)', () => {
    expect(handled.size).toBeGreaterThanOrEqual(15);
    expect(handled.get(KERNEL_QUEUE.BULK_OPS_JOB_NAMES.TRIAL_EXPIRY)).toContain('trial-expiry.service.ts');
    expect(handled.get(APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH)).toContain('oauth-refresh.processor.ts');
  });

  it('knows every @Processor: a new queue with its own processor must add its job names to this scan', () => {
    const processors = sources
      .filter(({ text }) => /^@Processor\(/m.test(text))
      .map(({ rel }) => rel)
      .sort();
    expect(processors).toEqual(KNOWN_PROCESSORS);
  });

  it('declares a tenant, a reason or noDatabase for every handled job name', () => {
    const missing = [...handled.entries()]
      .filter(([name]) => !(name in JOB_CONTEXT))
      .map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });

  it('declares every job name in the merged job vocabulary', () => {
    const missing = buildJobVocabulary(APP_JOB_VOCABULARY).jobNames.filter((name) => !(name in JOB_CONTEXT));
    expect(missing).toEqual([]);
  });

  it('has no entries for job names nothing handles', () => {
    expect(Object.keys(JOB_CONTEXT).filter((name) => !handled.has(name))).toEqual([]);
  });

  it('uses only listed system reasons', () => {
    const bad = Object.entries(JOB_CONTEXT)
      .map(([name, decl]) => [name, jobSystemReason(decl)] as const)
      .filter(([, reason]) => reason !== undefined && !isSystemReason(reason))
      .map(([name, reason]) => `${name}: ${reason}`);
    expect(bad).toEqual([]);
  });

  it('every declared reason is entered by a systemScope or forEachTenant call', () => {
    const callSites = sources
      .filter(({ file }) => !file.startsWith(KERNEL_RLS_DIR) && file !== APP_JOB_CONTEXT_FILE)
      .map(({ text }) => text)
      .join('\n');
    const appKeyOf = (reason: string) => Object.entries(APP_SYSTEM_REASONS).find(([, value]) => value === reason)?.[0];
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const unused = [...new Set(Object.values(JOB_CONTEXT).map(jobSystemReason))]
      .filter((reason): reason is NonNullable<typeof reason> => reason !== undefined)
      .filter((reason) => {
        const key = appKeyOf(reason);
        const arg = key ? `(?:'${escape(reason)}'|APP_SYSTEM_REASONS\\.${key})` : `'${escape(reason)}'`;
        return !new RegExp(`(?:systemScope|forEachTenant)\\(\\s*${arg}`).test(callSites);
      });
    expect(unused).toEqual([]);
  });

  it('the kernel copy of the WhatsApp job names matches the channel constants', () => {
    expect(FOUNDATION_JOB_CONTEXT).toHaveProperty([WHATSAPP.WHATSAPP_SEND_JOB_NAME]);
    expect(FOUNDATION_JOB_CONTEXT).toHaveProperty([WHATSAPP.WHATSAPP_STALE_SWEEP_JOB_NAME]);
  });

  it('refuses a job name the app declares again', () => {
    expect(() => mergeJobContext({ [KERNEL_QUEUE.BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]: { noDatabase: true } })).toThrow(
      /declared by the foundation and again by the app/,
    );
  });
});
