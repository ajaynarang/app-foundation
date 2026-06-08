'use client';

import { Badge } from '@app/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { CustomerListCardData, CustomerCardData } from '../../engine/types';

export function CustomerListCard({ data }: { data: Record<string, unknown> }) {
  const list = data as unknown as CustomerListCardData;
  const shown = list.customers.slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-sm font-medium text-foreground">Customers ({list.totalCount})</p>
      <div className="space-y-1.5">
        {shown.map((c: CustomerCardData) => (
          <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground truncate max-w-[150px]">{c.companyName}</span>
              <Badge
                className={
                  c.isActive
                    ? `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`
                    : `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`
                }
                variant="muted"
              >
                {c.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <span className="text-muted-foreground">{c.paymentTerms || '—'}</span>
          </div>
        ))}
      </div>
      {list.totalCount > 10 && (
        <p className="text-xs text-muted-foreground text-center">and {list.totalCount - 10} more...</p>
      )}
    </div>
  );
}
