'use client';

import { Button } from '@app/ui/components/ui/button';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';

interface ReactivateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  suspensionReason?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ReactivateTenantDialog({
  open,
  onOpenChange,
  tenantName,
  suspensionReason,
  onConfirm,
  isLoading = false,
}: ReactivateTenantDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivate Tenant</DialogTitle>
          <DialogDescription>Reactivating {tenantName} will restore access for all users</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <AlertDescription>✅ Users will be able to log in and access the system again</AlertDescription>
          </Alert>
          {suspensionReason && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Previous suspension reason:</p>
              <p className="mt-1 italic">{suspensionReason}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={isLoading}>
            Reactivate Tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
