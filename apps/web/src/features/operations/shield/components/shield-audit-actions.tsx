'use client';

import { useState } from 'react';
import { RefreshCw, Download, Settings2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Switch } from '@sally/ui/components/ui/switch';
import { Label } from '@sally/ui/components/ui/label';
import { Separator } from '@sally/ui/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { showError } from '@sally/ui';
import type { ShieldAudit, ShieldAuditScope } from '../types';
import { downloadAuditPdf } from '../utils/download-pdf';

const AUDIT_PERIOD_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
];

export interface ShieldAuditActionsProps {
  auditId?: ShieldAudit['id'];
  onRunAudit: (scope: ShieldAuditScope) => void;
  isAuditRunning: boolean;
  includeAi: boolean;
  setIncludeAi: (v: boolean) => void;
  includeCustomRules: boolean;
  setIncludeCustomRules: (v: boolean) => void;
  auditPeriodDays: number;
  setAuditPeriodDays: (v: number) => void;
}

/**
 * Shield toolbar actions (Zone 2): Run Full Audit + its run-config popover (1°), and
 * Download (2°). Lifted out of ScoreHero so the hero is display-only and the actions
 * live in the page toolbar. See sally-frontend-patterns §15.4 (Page Chrome).
 */
export function ShieldAuditActions({
  auditId,
  onRunAudit,
  isAuditRunning,
  includeAi,
  setIncludeAi,
  includeCustomRules,
  setIncludeCustomRules,
  auditPeriodDays,
  setAuditPeriodDays,
}: ShieldAuditActionsProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!auditId) return;
    setDownloading(true);
    try {
      await downloadAuditPdf(auditId);
    } catch {
      showError('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {auditId && (
        <Button variant="outline" size="sm" loading={downloading} onClick={handleDownload}>
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Audit settings">
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Audit Settings</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="include-ai" className="text-xs">
                    AI-Powered Findings
                  </Label>
                  <p className="text-2xs text-muted-foreground leading-tight">
                    Detects FMCSA violations beyond standard rules
                  </p>
                </div>
                <Switch id="include-ai" checked={includeAi} onCheckedChange={setIncludeAi} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="include-custom" className="text-xs">
                    Evaluate Custom Rules
                  </Label>
                  <p className="text-2xs text-muted-foreground leading-tight">
                    Checks your custom rules during the audit
                  </p>
                </div>
                <Switch id="include-custom" checked={includeCustomRules} onCheckedChange={setIncludeCustomRules} />
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="audit-period" className="text-xs">
                  Historical Period
                </Label>
                <Select value={String(auditPeriodDays)} onValueChange={(v) => setAuditPeriodDays(Number(v))}>
                  <SelectTrigger id="audit-period" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIT_PERIOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs text-muted-foreground leading-tight">
                  Active loads always included. Period controls completed load lookback.
                </p>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Button onClick={() => onRunAudit('FULL')} loading={isAuditRunning} size="sm">
        <RefreshCw className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Run Full Audit</span>
      </Button>
    </>
  );
}
