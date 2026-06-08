import * as fs from 'fs';
import * as path from 'path';

/**
 * Guardrail: BullMQ rejects custom job IDs that round-trip as integers via
 * `parseInt(id, 10).toString() === id`. After PR #734/735 migrated job-row PKs
 * from CUID strings (e.g. "clxabc123…") to Int columns, calls like
 *
 *   queue.add(NAME, payload, { jobId: String(job.id) })
 *
 * silently became broken — `String(48414) === '48414'`, which fails the
 * BullMQ validator and 500s the request. The runtime error message is
 * "Custom Id cannot be integers".
 *
 * Fix at every callsite: prefix the id so it's not a pure-digit string,
 * via `bullJobIdFromDbId(category, dbId)` from infrastructure/queue/queue.constants.ts.
 *
 * This spec scans the backend tree for any `jobId: String(<expr>.id)` or
 * `String(<expr>.id)` assigned to a variable that's then used as a BullMQ
 * jobId. Both patterns fail. Use the helper instead.
 */

const BACKEND_SRC = path.join(__dirname, '..');

// Forbidden patterns inside files. Each pattern is a regex that matches
// the line — match → CRITICAL violation, fix with `bullJobIdFromDbId`.
const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'jobId: String(<expr>.id) used as BullMQ option',
    pattern: /\bjobId:\s*String\([^)]*\.id\)/,
  },
  {
    name: 'const <name> = String(<expr>.id) — likely flows into BullMQ jobId',
    pattern: /\bconst\s+\w*[Jj]obId\s*=\s*String\([^)]*\.id\)/,
  },
];

// Files exempt from the guardrail. Each entry must come with a justification.
const ALLOW_LIST = new Set<string>([
  // The guardrail itself describes the pattern in comments.
  'architecture/bullmq-job-id-conventions.spec.ts',
  // The helper itself documents the pattern in its docstring.
  'infrastructure/queue/queue.constants.ts',
]);

function walk(dir: string, results: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '__tests__' ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      walk(full, results);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) continue;
      results.push(full);
    }
  }
}

describe('BullMQ job ID conventions', () => {
  const files: string[] = [];
  walk(BACKEND_SRC, files);

  it('rejects String(<expr>.id) patterns in BullMQ jobId callsites', () => {
    const violations: Array<{ file: string; line: number; pattern: string; code: string }> = [];

    for (const file of files) {
      const rel = path.relative(BACKEND_SRC, file);
      if (ALLOW_LIST.has(rel)) continue;

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines so the docstring examples don't trip the test.
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        for (const { name, pattern } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({ file: rel, line: i + 1, pattern: name, code: line.trim() });
          }
        }
      }
    }

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ${v.file}:${v.line}\n    pattern: ${v.pattern}\n    code:    ${v.code}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} BullMQ jobId convention violation(s):\n\n${detail}\n\n` +
          `Fix: import bullJobIdFromDbId from infrastructure/queue/queue.constants ` +
          `and use it as the jobId, e.g. \`bullJobIdFromDbId('documents', job.id)\`. ` +
          `See the helper's docstring for the BullMQ "Custom Id cannot be integers" rationale.`,
      );
    }
  });
});
