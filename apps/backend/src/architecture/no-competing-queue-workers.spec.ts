import * as fs from 'fs';
import * as path from 'path';

/**
 * Competing-consumer guardrail.
 *
 * `@nestjs/bullmq` instantiates one independent BullMQ `Worker` per
 * `@Processor(queueName)` class. Two `@Processor` classes on the SAME queue are
 * competing consumers — BullMQ delivers each job to exactly one of them, so a
 * foreign worker can grab a job and (via a `if (job.name !== mine) return`
 * guard) silently complete it without doing the work. This is exactly what
 * stalled rate-con imports on staging (2026-05-29): the email-intake worker
 * grabbed rate-con jobs and completed them with `returnValue: null`.
 *
 * The fix is one dispatcher `WorkerHost` per queue that routes by job name to
 * per-name handlers (see `BaseQueueDispatcher` + `QueueJobHandler`). This test
 * asserts at most one `@Processor(<queue>)` class per queue name.
 *
 * The allow-list holds queues still pending conversion to the dispatcher
 * pattern. Converting a queue removes its entry here in the same PR. Adding a
 * NEW second `@Processor` on any queue fails this test, blocking the PR.
 */

const SRC_DIR = path.resolve(__dirname, '..');

// Queues still pending dispatcher conversion. Now EMPTY — every shared queue
// was converted to a single dispatcher (documents, safety-detect, geo-compute,
// notifications, bulk-ops, finance, vendor-data). A new entry here would mark a
// regression awaiting conversion; adding a second @Processor on any queue
// without an entry fails the test below.
const PENDING_CONVERSION_QUEUES = new Set<string>([]);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...listTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Resolve QUEUE_NAMES.X tokens to their string values so the scan keys on the
// actual queue name (single source of truth) rather than the alias.
function loadQueueNameMap(): Record<string, string> {
  const constantsPath = path.join(SRC_DIR, 'infrastructure', 'queue', 'queue.constants.ts');
  const text = fs.readFileSync(constantsPath, 'utf8');
  const block = text.slice(text.indexOf('export const QUEUE_NAMES'));
  const map: Record<string, string> = {};
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

describe('No competing BullMQ queue workers', () => {
  const queueNameMap = loadQueueNameMap();
  const processorRe = /@Processor\(\s*QUEUE_NAMES\.(\w+)/g;

  // queueName -> list of files declaring a @Processor on it
  const byQueue: Record<string, string[]> = {};

  for (const file of listTsFiles(SRC_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(processorRe)) {
      const queue = queueNameMap[m[1]] ?? m[1];
      (byQueue[queue] ??= []).push(path.relative(SRC_DIR, file));
    }
  }

  it('has at most one @Processor class per queue (outside the pending-conversion allow-list)', () => {
    const offenders = Object.entries(byQueue)
      .filter(([queue, files]) => files.length > 1 && !PENDING_CONVERSION_QUEUES.has(queue))
      .map(([queue, files]) => `${queue}: ${files.join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('keeps the documents queue on a single dispatcher (rate-con regression guard)', () => {
    const documentsProcessors = byQueue['documents'] ?? [];
    expect(documentsProcessors.length).toBe(1);
  });
});
