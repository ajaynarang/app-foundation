import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import type { ShieldStatusLabel, ShieldCoverageItem } from '../types';
import { getStatusColor, getStatusBgColor } from './shield-helpers';
import { CoveragePopover } from './CoveragePopover';

interface CategoryScoreCardProps {
  label: string;
  score: number | null;
  onAudit: () => void;
  isAuditRunning: boolean;
  coverage?: ShieldCoverageItem[];
}

export function CategoryScoreCard({ label, score, onAudit, isAuditRunning, coverage }: CategoryScoreCardProps) {
  const displayScore = score ?? 0;
  const status: ShieldStatusLabel | null =
    score == null ? null : score >= 90 ? 'PROTECTED' : score >= 70 ? 'AT_RISK' : 'VULNERABLE';

  const ruleCheckCount = coverage?.filter((c) => c.source === 'rule').length ?? 0;

  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs md:text-sm font-medium text-muted-foreground">{label}</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={onAudit} disabled={isAuditRunning}>
            Audit
          </Button>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl md:text-2xl font-bold ${getStatusColor(status)}`}>
            {score != null ? displayScore : '—'}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getStatusBgColor(status)}`}
            style={{ width: `${score != null ? displayScore : 0}%` }}
          />
        </div>
        {coverage && coverage.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/60">
            {ruleCheckCount} check{ruleCheckCount !== 1 ? 's' : ''} active
            <CoveragePopover category={label} items={coverage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
