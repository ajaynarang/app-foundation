'use client';

import type { ApprovalArtifact } from '../../../types';

import { ArtifactFlags } from './artifact-flags';

type MessageArtifact = Extract<ApprovalArtifact, { kind: 'message' }>;

interface MessageArtifactProps {
  artifact: MessageArtifact;
  readOnly?: boolean;
  onChange?: (next: MessageArtifact) => void;
}

const CHANNEL_LABEL: Record<MessageArtifact['channel'], string> = {
  sms: 'SMS',
  email: 'Email',
  both: 'Email + SMS',
};

/**
 * Message-kind artifact renderer — a channel-aware outbound reminder (SMS or
 * email) for responsibilities that pick a channel at runtime (e.g. document
 * expiry). Shows Channel / To / Subject (when the channel includes email) /
 * Body. Editing flips To / Subject / Body to inputs; the parent owns
 * commit-on-approve.
 */
export function MessageArtifact({ artifact, readOnly, onChange }: MessageArtifactProps) {
  const handle = (patch: Partial<Omit<MessageArtifact, 'kind'>>) => {
    if (onChange) onChange({ ...artifact, ...patch });
  };

  const includesEmail = artifact.channel === 'email' || artifact.channel === 'both';

  return (
    <div className="rounded-md border border-border bg-card">
      <Field label="Channel">
        <span className="text-sm text-foreground">{CHANNEL_LABEL[artifact.channel]}</span>
      </Field>
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
      {includesEmail && (
        <Field label="Subject">
          {readOnly ? (
            <span className="text-sm text-foreground">{artifact.subject ?? ''}</span>
          ) : (
            <input
              className="w-full bg-transparent text-sm text-foreground outline-none focus:ring-0"
              value={artifact.subject ?? ''}
              onChange={(e) => handle({ subject: e.target.value })}
              aria-label="Subject"
            />
          )}
        </Field>
      )}
      <div className="px-4 py-3">
        {readOnly ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{artifact.body}</p>
        ) : (
          <textarea
            className="min-h-[180px] w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none focus:ring-0"
            value={artifact.body}
            onChange={(e) => handle({ body: e.target.value })}
            aria-label="Message body"
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
