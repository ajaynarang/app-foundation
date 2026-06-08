'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { CopyButton } from '@sally/ui/components/ui/copy-button';
import { RadioGroup, RadioGroupItem } from '@sally/ui/components/ui/radio-group';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useEmailIntakeSettings, useUpdateEmailIntakeSettings } from '../hooks';

interface EmailInboxSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailInboxSettingsSheet({ open, onOpenChange }: EmailInboxSettingsSheetProps) {
  const { data: settings, isLoading } = useEmailIntakeSettings();
  const updateSettings = useUpdateEmailIntakeSettings();

  const [approvedDomains, setApprovedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [unknownPolicy, setUnknownPolicy] = useState<'HOLD' | 'PARSE_ANYWAY' | 'REJECT'>('HOLD');

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setApprovedDomains(settings.approvedDomains);
      setAutoApprove(settings.autoApproveCustomerDomains);
      setUnknownPolicy(settings.unknownSenderPolicy);
    }
  }, [settings]);

  const handleAddDomain = () => {
    const domain = newDomain.trim().toLowerCase();
    if (domain && !approvedDomains.includes(domain)) {
      setApprovedDomains((prev) => [...prev, domain]);
      setNewDomain('');
    }
  };

  const handleRemoveDomain = (domain: string) => {
    setApprovedDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleSubmit = () => {
    updateSettings.mutate(
      {
        approvedDomains,
        autoApproveCustomerDomains: autoApprove,
        unknownSenderPolicy: unknownPolicy,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Email Intake Settings"
      description="Configure how inbound emails are processed"
      onSubmit={handleSubmit}
      submitLabel="Save"
      isSubmitting={updateSettings.isPending}
      pinnable
      resizable
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="space-y-6 p-px">
          {/* Inbound address (read-only with copy) */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Inbound Address
            </Label>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <span className="flex-1 text-sm font-mono text-foreground truncate select-all">
                {settings?.inboundAddress || 'Provisioning...'}
              </span>
              {settings?.inboundAddress && <CopyButton value={settings.inboundAddress} label="Inbound address" />}
            </div>
            <p className="text-xs text-muted-foreground">
              Forward rate confirmations to this address, or share it with brokers.
            </p>
          </div>

          {/* Approved domains */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Approved Domains
            </Label>
            {approvedDomains.length > 0 && (
              <div className="space-y-1.5">
                {approvedDomains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5"
                  >
                    <span className="text-sm font-mono text-foreground">{domain}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleRemoveDomain(domain)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDomain();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={handleAddDomain} disabled={!newDomain.trim()}>
                Add
              </Button>
            </div>
          </div>

          {/* Auto-approve */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="auto-approve"
              checked={autoApprove}
              onCheckedChange={(checked) => setAutoApprove(checked === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="auto-approve" className="text-sm cursor-pointer">
                Auto-approve from known customers
              </Label>
              <p className="text-2xs text-muted-foreground">
                Emails from domains matching existing customer contacts are automatically approved.
              </p>
            </div>
          </div>

          {/* Unknown sender policy */}
          <div className="space-y-2">
            <Label>Unknown Sender Policy</Label>
            <RadioGroup
              value={unknownPolicy}
              onValueChange={(v) => setUnknownPolicy(v as 'HOLD' | 'PARSE_ANYWAY' | 'REJECT')}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="HOLD" id="policy-hold" />
                <Label htmlFor="policy-hold" className="text-sm cursor-pointer">
                  Hold for review
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PARSE_ANYWAY" id="policy-parse" />
                <Label htmlFor="policy-parse" className="text-sm cursor-pointer">
                  Parse anyway
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="REJECT" id="policy-reject" />
                <Label htmlFor="policy-reject" className="text-sm cursor-pointer">
                  Reject
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}
    </FormSheet>
  );
}
