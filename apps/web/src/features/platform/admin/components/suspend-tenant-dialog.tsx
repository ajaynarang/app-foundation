'use client';

import { useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';

interface SuspendTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function SuspendTenantDialog({
  open,
  onOpenChange,
  tenantName,
  onConfirm,
  isLoading = false,
}: SuspendTenantDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim() && reason.trim().length >= 10) {
      onConfirm(reason);
      setReason('');
    }
  };

  const handleCancel = () => {
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend Tenant</DialogTitle>
          <DialogDescription>Suspending {tenantName} will disable access for all users</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <AlertDescription>⚠️ All users will be logged out and unable to access the system</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="reason">Suspension Reason * (min 10 characters)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Payment overdue, policy violation..."
              rows={4}
              className="bg-background"
            />
            {reason.trim() && reason.trim().length < 10 && (
              <p className="text-sm text-destructive">Reason must be at least 10 characters</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            loading={isLoading}
            disabled={!reason.trim() || reason.trim().length < 10}
          >
            Suspend Tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
