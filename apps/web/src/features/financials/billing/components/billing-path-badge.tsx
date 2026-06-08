'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { BillingPath } from '../types';

const BILLING_PATH_STYLES: Record<BillingPath, string> = {
  FACTORED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DIRECT: 'bg-muted text-muted-foreground border-border',
  AMAZON: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
};

const BILLING_PATH_LABELS: Record<BillingPath, string> = {
  FACTORED: 'Factored',
  DIRECT: 'Direct',
  AMAZON: 'Amazon',
};

interface BillingPathBadgeProps {
  billingPath?: BillingPath;
  className?: string;
}

export function BillingPathBadge({ billingPath, className }: BillingPathBadgeProps) {
  if (!billingPath) return null;

  return (
    <Badge className={`text-xs ${BILLING_PATH_STYLES[billingPath]} ${className ?? ''}`}>
      {BILLING_PATH_LABELS[billingPath]}
    </Badge>
  );
}
