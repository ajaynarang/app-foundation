'use client';

import { useState } from 'react';
import { Sparkles, X, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import type { ShieldAudit } from '../types';

export function AIInsightsCard({ audit }: { audit: ShieldAudit }) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (!audit.aiSummary) return null;

  if (isDismissed) {
    return (
      <Button
        variant="ghost"
        onClick={() => setIsDismissed(false)}
        className="w-full flex items-center gap-3 px-4 py-3 h-auto rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
      >
        <Sparkles className="h-3.5 w-3.5 text-info shrink-0" />
        <span className="text-sm text-muted-foreground truncate">
          <span className="font-medium text-foreground">Sally AI Insights</span>
          {' · '}
          {audit.aiSummary.slice(0, 80)}
          {audit.aiSummary.length > 80 ? '…' : ''}
        </span>
        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1 shrink-0">
          Expand <ChevronDown className="h-3 w-3" />
        </span>
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-info" />
          <CardTitle className="text-sm md:text-base">Sally AI Insights</CardTitle>
          <Badge variant="outline" className="text-2xs border-info/30 text-info bg-info/10">
            Powered by Sally AI
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setIsDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{audit.aiSummary}</p>

        {audit.aiInsights && audit.aiInsights.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
              Cross-Entity Insights
            </h4>
            <div className="space-y-2">
              {audit.aiInsights.map((insight, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-foreground">
                    {i + 1}. {insight.title}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {audit.aiActions && audit.aiActions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Priority Actions</h4>
            <div className="space-y-1.5">
              {audit.aiActions.map((action, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground font-mono text-xs mt-0.5">{action.priority}.</span>
                  <span className="text-foreground">{action.action}</span>
                  {action.dueDate && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">(by {action.dueDate})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
