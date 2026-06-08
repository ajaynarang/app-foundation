import { ShieldCheck, Clock, Timer } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import type { ShieldAudit } from '../types';
import {
  getStatusColor,
  getStatusBgColor,
  getStatusLabel,
  formatTimestamp,
  formatNextScheduled,
} from './shield-helpers';

interface ScoreHeroProps {
  audit: ShieldAudit;
  nextScheduledAt?: string;
}

export function ScoreHero({ audit, nextScheduledAt }: ScoreHeroProps) {
  const score = audit.overallScore;
  const displayScore = score ?? 0;
  const findings = audit.findings ?? [];
  const nextScheduled = formatNextScheduled(nextScheduledAt);

  const auditCoverage = audit.coverage as
    | Record<string, { check: string; regulation: string; source: 'rule' | 'ai' }[]>
    | null
    | undefined;
  const totalRuleChecks = auditCoverage
    ? Object.values(auditCoverage)
        .flat()
        .filter((c) => c.source === 'rule').length
    : 0;

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 md:p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex-shrink-0">
              <ShieldCheck className={`h-12 w-12 md:h-16 md:w-16 ${getStatusColor(audit.statusLabel)}`} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                  {score != null ? displayScore : '—'}
                </span>
                <span className="text-lg md:text-xl text-muted-foreground">/ 100</span>
              </div>
              <div className={`text-sm md:text-base font-semibold ${getStatusColor(audit.statusLabel)}`}>
                {getStatusLabel(audit.statusLabel)}
              </div>
              {totalRuleChecks > 0 && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {totalRuleChecks} compliance check{totalRuleChecks !== 1 ? 's' : ''} active
                </div>
              )}
              {findings.length > 0 && (
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  {findings.length} item{findings.length !== 1 ? 's' : ''} need{findings.length === 1 ? 's' : ''} your
                  attention
                </p>
              )}
            </div>
          </div>

          {/* Audit timing (status info; the run/download actions live in the page toolbar) */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last audit: {formatTimestamp(audit.completedAt)}
            </div>
            {nextScheduled && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                Next scheduled: {nextScheduled}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 md:mt-6">
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getStatusBgColor(audit.statusLabel)}`}
              style={{ width: `${score != null ? displayScore : 0}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
