'use client';

import { AlertTriangle } from 'lucide-react';
import { useBackfillStatus } from '../hooks/use-factoring-transactions';

/**
 * Phase 4C — surfaces the count of backfill-estimated factoring transactions
 * so dispatchers know to verify them against the factor statement.
 *
 * Renders nothing when no estimates exist (clean tenants).
 */
export function BackfillBanner() {
  const { data, isLoading } = useBackfillStatus();
  if (isLoading || !data || data.estimatedTransactionCount === 0) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3 dark:bg-yellow-950/20"
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <p className="text-sm text-foreground">
        <strong>
          {data.estimatedTransactionCount} factoring transaction
          {data.estimatedTransactionCount === 1 ? '' : 's'}
        </strong>{' '}
        {data.estimatedTransactionCount === 1 ? 'is an estimate' : 'are estimates'} from the rate-card — verify against
        your factor statement and edit any that are off.
      </p>
    </div>
  );
}
