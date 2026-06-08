'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';

interface RejectTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function RejectTenantDialog({
  open,
  onOpenChange,
  tenantName,
  onConfirm,
  isLoading = false,
}: RejectTenantDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
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
          <DialogTitle>Reject Tenant Registration</DialogTitle>
          <DialogDescription>Provide a reason for rejecting {tenantName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Rejection Reason *</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Invalid DOT number, duplicate registration..."
            rows={4}
            className="bg-background"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} loading={isLoading} disabled={!reason.trim()}>
            Reject Tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
