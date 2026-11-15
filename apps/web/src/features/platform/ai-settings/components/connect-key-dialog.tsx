'use client';

import { useEffect, useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Checkbox } from '@app/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { AiCredentialType } from '@app/shared-types';
import type { AiRetentionPolicy, PasteKeyCredentialType } from '@app/shared-types';
import { CREDENTIAL_TYPE_META, RETENTION_POLICY } from '../constants';
import { useConnectKey } from '../hooks/use-ai-settings';

/** The server refuses a shorter secret (`ConnectKeyInputSchema`). */
const MIN_SECRET_LENGTH = 8;

export interface ConnectKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Picked in the Add menu. An AWS role has its own sheet. */
  type: PasteKeyCredentialType;
  policy: AiRetentionPolicy;
}

/**
 * Paste one key. The server tests it with one small call before storing anything; when the test fails, its reason
 * (secret redacted) is shown here. An Anthropic key under zero retention needs the owner's attestation of a
 * zero-retention agreement, recorded with their name and the time.
 */
export function ConnectKeyDialog({ open, onOpenChange, type, policy }: ConnectKeyDialogProps) {
  const connect = useConnectKey();
  const [secret, setSecret] = useState('');
  const [hasAttested, setHasAttested] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  // A secret never survives closing the dialog.
  useEffect(() => {
    if (open) {
      setSecret('');
      setHasAttested(false);
      setProbeError(null);
      connect.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; run on open only
  }, [open]);

  const needsAttestation = type === AiCredentialType.ANTHROPIC_KEY && policy === RETENTION_POLICY.ZDR;
  const canSubmit = secret.trim().length >= MIN_SECRET_LENGTH && (!needsAttestation || hasAttested);

  const handleSubmit = () => {
    setProbeError(null);
    connect.mutate(
      { type, secret: secret.trim(), ...(needsAttestation ? { zdrAttested: true } : {}) },
      {
        onSuccess: () => onOpenChange(false),
        // The error's detail is the server's redacted test result: show it where the key was pasted.
        onError: (error: Error) => setProbeError(extractErrorMessage(error)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect your {CREDENTIAL_TYPE_META[type].label}</DialogTitle>
          <DialogDescription>{CREDENTIAL_TYPE_META[type].blurb}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-credential-secret">API key</Label>
            <Input
              id="ai-credential-secret"
              type="password"
              autoComplete="off"
              autoFocus
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Paste the key"
            />
            <p className="text-xs text-muted-foreground">
              It is tested with one small call before anything is stored. Afterwards only its last four characters are
              shown.
            </p>
          </div>

          {needsAttestation && (
            <div className="flex items-start gap-2 rounded-md border border-border p-3">
              <Checkbox
                id="ai-zdr-attest"
                checked={hasAttested}
                onCheckedChange={(checked) => setHasAttested(checked === true)}
              />
              <Label htmlFor="ai-zdr-attest" className="text-xs font-normal leading-snug">
                I confirm our organisation has a zero data retention agreement with Anthropic that covers this key. My
                name and the time are recorded.
              </Label>
            </div>
          )}

          {probeError && (
            <p className="rounded-md bg-critical/10 p-3 text-sm text-critical-text" role="alert">
              {probeError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={connect.isPending}>
            Test and connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
