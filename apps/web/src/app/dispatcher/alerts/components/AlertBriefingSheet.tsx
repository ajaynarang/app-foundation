'use client';

import { Sparkles, RefreshCw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAlertBriefing } from '@/features/operations/alerts';
import type { AlertBriefingSituation } from '@/features/operations/alerts';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';

const SEVERITY_BORDER: Record<string, string> = {
  critical: SEMANTIC_COLORS.critical.borderL,
  high: SEMANTIC_COLORS.caution.borderL,
  medium: SEMANTIC_COLORS.caution.borderL,
};

const SEVERITY_BADGE: Record<string, 'critical' | 'caution' | 'muted'> = {
  critical: 'critical',
  high: 'caution',
  medium: 'muted',
};

function formatTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export function AlertBriefingSheet() {
  const { briefing, isLoading, generate, isGenerating } = useAlertBriefing();
  const sizing = useSheetSizing('alert');

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-2" />
          Sally Briefing
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
      >
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="alert" /> : undefined}>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Alert Intelligence Briefing
          </SheetTitle>
          <SheetDescription className="sr-only">
            AI-generated alert intelligence briefing with situational awareness and recommendations
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Generate / Regenerate controls */}
            <div className="flex items-center justify-between">
              {briefing?.generatedAt && (
                <span className="text-xs text-muted-foreground">Generated {formatTimeAgo(briefing.generatedAt)}</span>
              )}
              <Button variant="outline" size="sm" onClick={() => generate(!!briefing)} loading={isGenerating}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {briefing ? 'Regenerate' : 'Generate Briefing'}
              </Button>
            </div>

            {/* Loading state */}
            {(isLoading || isGenerating) && !briefing && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Overall status */}
            {briefing && (
              <>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-foreground">{briefing.overallStatus}</p>
                  </CardContent>
                </Card>

                {/* Situations */}
                <div className="space-y-3">
                  {briefing.situations.map((situation, i) => (
                    <SituationCard key={i} situation={situation} />
                  ))}
                </div>

                {briefing.situations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No situations to report. Fleet is operating normally.
                  </p>
                )}
              </>
            )}

            {/* Empty state (no briefing, not loading) */}
            {!briefing && !isLoading && !isGenerating && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Let Sally analyze your alerts and surface what matters most.
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SituationCard({ situation }: { situation: AlertBriefingSituation }) {
  const borderClass = SEVERITY_BORDER[situation.severity] || SEMANTIC_COLORS.neutral.borderL;
  const badgeVariant = SEVERITY_BADGE[situation.severity] || 'outline';

  return (
    <Card className={`border-l-4 ${borderClass}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} className="text-xs">
            {situation.severity}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{situation.title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{situation.summary}</p>
        <div className="bg-muted/50 rounded p-2">
          <p className="text-xs text-foreground">
            <span className="font-medium">Recommendation:</span> {situation.recommendation}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {situation.driverIds.length > 0 && (
            <span>
              {situation.driverIds.length} driver{situation.driverIds.length !== 1 ? 's' : ''}
            </span>
          )}
          {situation.loadIds.length > 0 && (
            <span>
              · {situation.loadIds.length} load{situation.loadIds.length !== 1 ? 's' : ''}
            </span>
          )}
          {situation.relatedAlertIds.length > 0 && (
            <span>
              · {situation.relatedAlertIds.length} alert{situation.relatedAlertIds.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
