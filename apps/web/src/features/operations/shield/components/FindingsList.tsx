import { CheckCircle2, ShieldCheck } from 'lucide-react';
import type { ShieldFinding, ShieldFindingCategory, ShieldFindingSource, ShieldFindingSeverity } from '../types';
import { FindingCard } from './FindingCard';

interface FindingsListProps {
  findings: ShieldFinding[];
  category?: ShieldFindingCategory;
  source?: ShieldFindingSource;
  severity?: ShieldFindingSeverity;
  onResolve: (id: string) => void;
  resolvingId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function FindingsList({
  findings,
  category,
  source,
  severity,
  onResolve,
  resolvingId,
  selectedIds,
  onToggleSelect,
}: FindingsListProps) {
  let filtered = findings;
  if (category) filtered = filtered.filter((f) => f.category === category);
  if (source) filtered = filtered.filter((f) => f.source === source);
  if (severity) filtered = filtered.filter((f) => f.severity === severity);

  if (filtered.length === 0) {
    const isFiltered = category || source || severity;
    const totalCount = findings.length;

    return (
      <div className="text-center py-8 md:py-12">
        {totalCount === 0 ? (
          <>
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="text-xs text-muted-foreground mt-1">No compliance issues found in this audit.</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No matching findings</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isFiltered
                ? `${totalCount} finding${totalCount !== 1 ? 's' : ''} exist but none match the current filters.`
                : 'No findings to show.'}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((f) => (
        <FindingCard
          key={f.id}
          finding={f}
          onResolve={onResolve}
          isResolving={resolvingId === f.id}
          isSelected={selectedIds.has(f.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
