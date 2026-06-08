'use client';

import { Mail } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { CopyButton } from '@sally/ui/components/ui/copy-button';

interface EmailInboxEmptyStateProps {
  inboundAddress?: string;
  view?: 'PENDING' | 'ARCHIVE';
}

const EMPTY_MESSAGES: Record<NonNullable<EmailInboxEmptyStateProps['view']>, { title: string; description: string }> = {
  PENDING: {
    title: 'No pending emails',
    description:
      'All caught up — no rate confirmations waiting for review. Forward rate-con emails to your inbound address.',
  },
  ARCHIVE: {
    title: 'Nothing archived yet',
    description: 'Imported and discarded emails will land here for reference.',
  },
};

export function EmailInboxEmptyState({ inboundAddress, view = 'PENDING' }: EmailInboxEmptyStateProps) {
  const msg = EMPTY_MESSAGES[view];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="rounded-full bg-muted/60 p-2.5">
        <Mail className="h-5 w-5 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium text-foreground">{msg.title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{msg.description}</p>
      {view === 'PENDING' && inboundAddress && (
        <div className="flex items-center gap-1 mt-2 w-full max-w-sm">
          <Input readOnly value={inboundAddress} className="text-xs font-mono text-muted-foreground" />
          <CopyButton value={inboundAddress} label="Inbound address" />
        </div>
      )}
    </div>
  );
}
