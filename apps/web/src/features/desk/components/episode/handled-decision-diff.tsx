'use client';

/**
 * Line-by-line diff rendering for EDITED approvals on the Handled-mode
 * sheet. Deliberately small — no diff library, no word-level granularity
 * (KISS). Email-only for v1; other artifact kinds (diff, composite) fall
 * back to plain artifact rendering upstream and never reach this
 * component.
 */
interface EmailLikeAction {
  to?: string;
  subject?: string;
  body?: string;
}

interface HandledDecisionDiffProps {
  proposed: EmailLikeAction;
  approved: EmailLikeAction;
}

export function HandledDecisionDiff({ proposed, approved }: HandledDecisionDiffProps) {
  const propBody = proposed.body ?? '';
  const apprBody = approved.body ?? '';
  return (
    <div className="space-y-3">
      {(['to', 'subject'] as const).map((field) =>
        proposed[field] !== approved[field] ? (
          <DiffField key={field} label={field} before={proposed[field] ?? ''} after={approved[field] ?? ''} />
        ) : null,
      )}
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Body</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-destructive/5 p-2 text-xs text-foreground">
            {propBody || <span className="text-muted-foreground italic">(empty)</span>}
          </pre>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-emerald-500/5 p-2 text-xs text-foreground">
            {apprBody || <span className="text-muted-foreground italic">(empty)</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DiffField({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="space-y-1 text-xs">
        <div className="rounded border border-border bg-destructive/5 px-2 py-1 text-destructive/80 line-through">
          {before || <span className="italic">(empty)</span>}
        </div>
        <div className="rounded border border-border bg-emerald-500/5 px-2 py-1 text-emerald-600 dark:text-emerald-400">
          {after || <span className="italic">(empty)</span>}
        </div>
      </div>
    </div>
  );
}
