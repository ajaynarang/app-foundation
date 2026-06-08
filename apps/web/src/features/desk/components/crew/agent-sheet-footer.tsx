'use client';

import { Button } from '@/shared/components/ui/button';

import type { AgentSupervisor } from '../../types';

interface AgentSheetFooterProps {
  canEdit: boolean;
  isAgentActive: boolean;
  supervisor: AgentSupervisor | null;
  onPauseAgent: () => void;
  onResumeAgent: () => void;
}

/**
 * Left-aligned footer content for the agent sheet. FormSheet owns the
 * Cancel + Save buttons on the right — this piece owns the "Pause/Resume
 * agent" danger-ghost button (editor) or "View only" microcopy (read-only
 * viewer).
 */
export function AgentSheetFooter({
  canEdit,
  isAgentActive,
  supervisor,
  onPauseAgent,
  onResumeAgent,
}: AgentSheetFooterProps) {
  if (!canEdit) {
    const email = (supervisor as (AgentSupervisor & { email?: string }) | null)?.email;
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>View only · contact</span>
        {supervisor ? (
          <a className="font-medium text-foreground underline-offset-2 hover:underline" href={`mailto:${email ?? ''}`}>
            {supervisor.firstName} {supervisor.lastName}
          </a>
        ) : (
          <span className="italic">your workspace admin</span>
        )}
        <span>to request changes.</span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={isAgentActive ? onPauseAgent : onResumeAgent}
    >
      {isAgentActive ? 'Pause agent' : 'Resume agent'}
    </Button>
  );
}
