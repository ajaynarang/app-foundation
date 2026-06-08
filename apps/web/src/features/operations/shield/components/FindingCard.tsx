import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import type { ShieldFinding } from '../types';
import { getSeverityBadge, getSeverityIcon, getSourceBadge, getEntityHref, getCategoryLabel } from './shield-helpers';

interface FindingCardProps {
  finding: ShieldFinding;
  onResolve: (id: string) => void;
  isResolving: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

export function FindingCard({ finding, onResolve, isResolving, isSelected, onToggleSelect }: FindingCardProps) {
  const entityHref = getEntityHref(finding.entityType, finding.entityId);

  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2 mt-0.5">
            <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(finding.id)} />
            {getSeverityIcon(finding.severity)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {getSeverityBadge(finding.severity)}
              {getSourceBadge(finding.source)}
              <Badge variant="outline" className="text-xs">
                {getCategoryLabel(finding.category)}
              </Badge>
              {finding.entityName && entityHref ? (
                <Link
                  href={entityHref}
                  className="text-xs text-foreground underline underline-offset-2 hover:text-muted-foreground truncate"
                >
                  {finding.entityName}
                </Link>
              ) : finding.entityName ? (
                <span className="text-xs text-muted-foreground truncate">{finding.entityName}</span>
              ) : null}
            </div>
            <h4 className="text-sm font-medium text-foreground">{finding.title}</h4>
            {finding.regulation && <p className="text-[11px] text-muted-foreground font-mono">{finding.regulation}</p>}
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{finding.description}</p>
            {finding.impact && <p className="text-xs text-critical mt-1">Impact: {finding.impact}</p>}
            {finding.recommendation && (
              <p className="text-xs text-muted-foreground mt-1">Recommendation: {finding.recommendation}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onResolve(finding.id)}
                disabled={isResolving}
              >
                {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Resolve
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
