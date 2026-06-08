/**
 * export-scope-vocab.ts — emit a wiki-readable snapshot of the scope vocabulary.
 *
 * Reads from the single source of truth (packages/shared-types/src/ai/agent-scopes.schema.ts),
 * groups by domain, and writes markdown that the Obsidian wiki pipeline can ingest.
 *
 * Invoke:  pnpm docs:scope-vocab
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  AgentScopeSchema,
  SCOPE_DESCRIPTIONS,
  NEVER_EXTERNAL_SCOPES,
  type AgentScope,
} from '@sally/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT = join(
  __dirname,
  '..',
  '.docs/plans/06-sally-ai/2026-04-17-agent-native-readiness/09-scope-vocabulary.md',
);

const never = new Set<string>(NEVER_EXTERNAL_SCOPES);

const lines: string[] = [];
lines.push('---');
lines.push('status: current');
lines.push('source: auto-generated from packages/shared-types/src/ai/agent-scopes.schema.ts');
lines.push(`generated_at: ${new Date().toISOString()}`);
lines.push('---');
lines.push('');
lines.push('# Scope Vocabulary (Agent-Native Readiness)');
lines.push('');
lines.push(
  '> Auto-generated snapshot. Do not edit by hand — regenerate with `pnpm docs:scope-vocab`.',
);
lines.push('');
lines.push(
  'This is the canonical scope vocabulary exposed to external agents (OAuth clients, API keys). Each entry links to the HITL tier that applies when the scope is invoked and the live sample tools that use it.',
);
lines.push('');
lines.push(`Scopes excluded from external grants: ${[...never].map((s) => `\`${s}\``).join(', ') || '—'}.`);
lines.push('');

const grouped = new Map<string, AgentScope[]>();
for (const scope of AgentScopeSchema.options) {
  if (never.has(scope)) continue;
  const domain = scope.split(':')[0];
  const list = grouped.get(domain) ?? [];
  list.push(scope);
  grouped.set(domain, list);
}

for (const [domain, scopes] of [...grouped.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  lines.push(`## ${domain}`);
  lines.push('');
  lines.push('| Scope | Summary | HITL tier | Sample tools |');
  lines.push('|-------|---------|-----------|--------------|');
  for (const scope of scopes) {
    const d = SCOPE_DESCRIPTIONS[scope];
    const tools =
      d.sampleTools.length > 0
        ? d.sampleTools.map((t) => `\`${t}\``).join(', ')
        : '—';
    lines.push(`| \`${scope}\` | ${d.summary} | ${d.hitlTier} | ${tools} |`);
  }
  lines.push('');
  for (const scope of scopes) {
    const d = SCOPE_DESCRIPTIONS[scope];
    lines.push(`### \`${scope}\``);
    lines.push('');
    lines.push(d.grantsPlainEnglish);
    lines.push('');
  }
}

writeFileSync(OUT, lines.join('\n'));
// eslint-disable-next-line no-console -- CLI script output
console.log(`Wrote ${OUT}`);
