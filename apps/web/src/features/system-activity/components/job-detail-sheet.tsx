'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import { RefreshCw, Ban, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { JobStatusBadge } from './job-status-badge';
import { CATEGORY_DISPLAY_NAMES, TYPE_DISPLAY_NAMES } from '../types';
import type { Job } from '../types';
import { formatDurationBetween, formatJobLabel } from '../utils';

interface JobDetailSheetProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: (jobId: number) => void;
  onCancel: (jobId: number) => void;
  isRetrying: boolean;
  isCancelling: boolean;
  showTenant?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JsonViewer({ data, label }: { data: Record<string, any>; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors w-full">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="relative">
          <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-6 w-6 p-0" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-auto max-h-64 font-mono text-foreground">
            {json}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function JobDetailSheet({
  job,
  open,
  onOpenChange,
  onRetry,
  onCancel,
  isRetrying,
  isCancelling,
  showTenant = false,
}: JobDetailSheetProps) {
  const { formatTimestamp } = useFormatters();
  const sizing = useSheetSizing('job');
  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
      >
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="job" /> : undefined}>
          <div className="flex items-center gap-3">
            <SheetTitle className="font-mono text-sm">Job {formatJobLabel(job.id)}</SheetTitle>
            <JobStatusBadge status={job.status} />
          </div>
          <SheetDescription className="sr-only">Details for background job {job.id}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Category</p>
                <p className="text-foreground">{CATEGORY_DISPLAY_NAMES[job.category] ?? job.category}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Type</p>
                <p className="text-foreground">{TYPE_DISPLAY_NAMES[job.type] ?? job.type}</p>
              </div>
              {showTenant && job.tenant && (
                <div>
                  <p className="text-muted-foreground text-xs">Tenant</p>
                  <p className="text-foreground">{job.tenant.companyName}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">Attempts</p>
                <p className="text-foreground">
                  {job.attempts}/{job.maxAttempts}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Duration</p>
                <p className="text-foreground">{formatDurationBetween(job.startedAt, job.completedAt)}</p>
              </div>
            </div>

            <Separator />

            {/* Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Queued</p>
                <p className="text-foreground">{formatTimestamp(job.queuedAt, DISPLAY_FORMATS.TIME_ONLY)}</p>
              </div>
              {job.startedAt && (
                <div>
                  <p className="text-muted-foreground text-xs">Started</p>
                  <p className="text-foreground">{formatTimestamp(job.startedAt, DISPLAY_FORMATS.TIME_ONLY)}</p>
                </div>
              )}
              {job.completedAt && (
                <div>
                  <p className="text-muted-foreground text-xs">Completed</p>
                  <p className="text-foreground">{formatTimestamp(job.completedAt, DISPLAY_FORMATS.TIME_ONLY)}</p>
                </div>
              )}
            </div>

            {/* Error section */}
            {job.errorMessage && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground text-sm">Error</h4>
                  <pre className="text-xs bg-critical/10 text-critical p-3 rounded-md overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                    {job.errorMessage}
                  </pre>
                  {job.errorDetails && <JsonViewer data={job.errorDetails} label="Error Details" />}
                </div>
              </>
            )}

            {/* Input Data */}
            {job.inputData && Object.keys(job.inputData).length > 0 && (
              <>
                <Separator />
                <JsonViewer data={job.inputData} label="Input Data" />
              </>
            )}

            {/* Parsing Metadata */}
            {job.resultData?.parsing && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium text-foreground text-sm mb-2">Parsing Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Strategy</div>
                    <div className="text-foreground">{job.resultData.parsing.actualStrategy}</div>
                    <div className="text-muted-foreground">Fallback</div>
                    <div className="text-foreground">
                      {job.resultData.parsing.fallbackUsed ? `Yes (${job.resultData.parsing.fallbackReason})` : 'No'}
                    </div>
                    <div className="text-muted-foreground">Duration</div>
                    <div className="text-foreground">{(job.resultData.parsing.durationMs / 1000).toFixed(1)}s</div>
                    {job.resultData.parsing.textExtractionChars !== null &&
                      job.resultData.parsing.textExtractionChars !== undefined && (
                        <>
                          <div className="text-muted-foreground">Text extracted</div>
                          <div className="text-foreground">
                            {job.resultData.parsing.textExtractionChars.toLocaleString()} chars
                          </div>
                        </>
                      )}
                  </div>
                </div>
              </>
            )}

            {/* Result Data */}
            {job.resultData && Object.keys(job.resultData).length > 0 && (
              <>
                <Separator />
                <JsonViewer data={job.resultData} label="Result Data" />
              </>
            )}
          </div>
        </div>

        {/* Sticky Footer Actions */}
        {(job.status === 'FAILED' || job.status === 'QUEUED' || job.status === 'PROCESSING') && (
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {job.status === 'FAILED' && (
              <Button onClick={() => onRetry(job.id)} loading={isRetrying}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
            {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
              <Button variant="outline" onClick={() => onCancel(job.id)} loading={isCancelling}>
                <Ban className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
