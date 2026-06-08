'use client';

import type { ApprovalArtifact } from '../../../types';

import { ArtifactFlags } from './artifact-flags';

type EmailArtifact = Extract<ApprovalArtifact, { kind: 'email' }>;

interface EmailArtifactProps {
  artifact: EmailArtifact;
  readOnly?: boolean;
  onChange?: (next: EmailArtifact) => void;
}

/**
 * Email-kind artifact renderer — To, Subject, Body as a mail-style card.
 * Editing flips To / Subject to inputs and Body to a textarea. The parent
 * owns commit-on-approve; this component just lifts onChange.
 */
export function EmailArtifact({ artifact, readOnly, onChange }: EmailArtifactProps) {
  const handle = (patch: Partial<Omit<EmailArtifact, 'kind'>>) => {
    if (onChange) onChange({ ...artifact, ...patch });
  };

  return (
    <div className="rounded-md border border-border bg-card">
      <Field label="To">
        {readOnly ? (
          <span className="text-sm text-foreground break-all">{artifact.to}</span>
        ) : (
          <input
            className="w-full bg-transparent text-sm text-foreground outline-none focus:ring-0"
            value={artifact.to}
            onChange={(e) => handle({ to: e.target.value })}
            aria-label="To"
          />
        )}
      </Field>
      <Field label="Subject">
        {readOnly ? (
          <span className="text-sm text-foreground">{artifact.subject}</span>
        ) : (
          <input
            className="w-full bg-transparent text-sm text-foreground outline-none focus:ring-0"
            value={artifact.subject}
            onChange={(e) => handle({ subject: e.target.value })}
            aria-label="Subject"
          />
        )}
      </Field>
      <div className="px-4 py-3">
        {readOnly ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{artifact.body}</p>
        ) : (
          <textarea
            className="min-h-[180px] w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none focus:ring-0"
            value={artifact.body}
            onChange={(e) => handle({ body: e.target.value })}
            aria-label="Email body"
          />
        )}
      </div>
      <ArtifactFlags flags={artifact.flags} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-3 border-b border-border px-4 py-2.5">
      <span className="pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
