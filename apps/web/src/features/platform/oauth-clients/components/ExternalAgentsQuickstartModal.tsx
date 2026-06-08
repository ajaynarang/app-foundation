'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Label } from '@sally/ui/components/ui/label';
import { UrlRow } from '@sally/ui/components/ui/url-row';
import { STORAGE_KEYS } from '@/shared/constants/storage-keys';

const DEFAULT_MCP_URL = 'https://api.sally.app/mcp';

export interface ExternalAgentsQuickstartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user clicks "Register an agent" on step 1. */
  onRegisterClick?: () => void;
}

function getMcpEndpointUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_MCP_ENDPOINT_URL;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MCP_URL;
}

export function ExternalAgentsQuickstartModal({
  open,
  onOpenChange,
  onRegisterClick,
}: ExternalAgentsQuickstartModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const mcpUrl = getMcpEndpointUrl();

  // Reset to step 1 every time the modal is closed+reopened.
  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  const persistDismissal = () => {
    if (typeof window === 'undefined') return;
    if (dontShowAgain) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.DESK_QUICKSTART_DISMISSED, 'true');
      } catch {
        // localStorage disabled — silently accept the in-session dismissal
      }
    }
  };

  const close = () => {
    persistDismissal();
    onOpenChange(false);
  };

  const handleRegisterClick = () => {
    persistDismissal();
    onOpenChange(false);
    onRegisterClick?.();
  };

  const next = () => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  const prev = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Connect an external AI agent'}
            {step === 2 && 'Your MCP endpoint'}
            {step === 3 && 'Paste into ChatGPT or Claude'}
          </DialogTitle>
          <DialogDescription>Step {step} of 3 — takes about 2 minutes.</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">Register an OAuth client</span> for each external agent
              (ChatGPT, Claude, or your own tool). Each client gets its own scoped credentials so you can see and revoke
              exactly what it can touch.
            </p>
            <p>
              When you register a client you choose the scopes it may hold. The agent then asks the end user to approve
              those scopes on first connect — same flow as connecting a third-party app to Slack or GitHub.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="text-foreground font-medium mb-1">Heads up</p>
              <p>
                You can grant read-only scopes first and upgrade later — every write still requires a per-call
                confirmation.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your agent will need to discover your MCP endpoint and OAuth metadata. Most clients handle this
              automatically once they know the base URL:
            </p>
            <UrlRow label="MCP server URL" value={mcpUrl} />
            <p className="text-xs">
              Copy the URL above. You&apos;ll paste it into the external agent&apos;s connector/app settings on the next
              step.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Open the external agent&apos;s connector settings and paste the URL you copied. Exact steps vary by
              client:
            </p>
            <ul className="space-y-2 pl-4">
              <li className="list-disc">
                <span className="text-foreground font-medium">Claude.ai / Claude Desktop:</span> Profile &rarr;
                Customize &rarr; Connectors &rarr; + &rarr; paste URL &rarr; Connect.
              </li>
              <li className="list-disc">
                <span className="text-foreground font-medium">ChatGPT:</span> Settings &rarr; Apps &rarr; Advanced
                &rarr; Developer mode &rarr; Create app &rarr; paste URL &rarr; OAuth.
              </li>
              <li className="list-disc">
                <span className="text-foreground font-medium">Other MCP clients:</span> use the standard MCP connector
                config with the URL above.
              </li>
            </ul>
            <p>
              Once connected, you&apos;ll see the agent appear under Settings &rarr; OAuth Clients — that&apos;s where
              you manage its scopes, pause it, or revoke it.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id="quickstart-dont-show-again"
            checked={dontShowAgain}
            onCheckedChange={(v) => setDontShowAgain(v === true)}
          />
          <Label htmlFor="quickstart-dont-show-again" className="text-xs text-muted-foreground cursor-pointer">
            Don&apos;t show this again
          </Label>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={prev}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            {step < 3 ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={handleRegisterClick}>Register an agent</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
