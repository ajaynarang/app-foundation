'use client';

import type { ApprovalArtifact } from '../../../types';

import { ArtifactFlags } from './artifact-flags';

type DiffArtifact = Extract<ApprovalArtifact, { kind: 'diff' }>;

interface DiffArtifactProps {
  artifact: DiffArtifact;
  readOnly?: boolean;
}

/**
 * Diff-kind artifact renderer — before/after field comparison. Shows only
 * the fields that actually changed; unchanged keys are omitted. Inline
 * editing is not yet supported for this kind — approvers can approve or
 * reject; editing is planned follow-up work.
 */
export function DiffArtifact({ artifact, readOnly: _readOnly }: DiffArtifactProps) {
  const changedKeys = computeChangedKeys(artifact.before, artifact.after);

  return (
    <div className="rounded-md border border-border bg-card">
      {artifact.summary && (
        <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          {artifact.summary}
        </div>
      )}
      {changedKeys.length === 0 ? (
        <p className="px-4 py-3 text-xs italic text-muted-foreground">No changes detected.</p>
      ) : (
        <dl>
          {changedKeys.map((key) => (
            <DiffRow key={key} label={humanizeKey(key)} before={artifact.before[key]} after={artifact.after[key]} />
          ))}
        </dl>
      )}
      <ArtifactFlags flags={artifact.flags} />
    </div>
  );
}

function DiffRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  return (
    <div className="grid grid-cols-[140px_1fr_1fr] items-baseline gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        <span className="inline-block rounded bg-destructive/10 px-2 py-0.5 text-sm text-destructive line-through">
          {stringifyValue(before)}
        </span>
      </dd>
      <dd className="tabular-nums">
        <span className="inline-block rounded bg-emerald-500/10 px-2 py-0.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {stringifyValue(after)}
        </span>
      </dd>
    </div>
  );
}

function computeChangedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  return changed;
}

function stringifyValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
