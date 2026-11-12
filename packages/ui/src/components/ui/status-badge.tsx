import * as React from 'react';

import { cn } from '../../lib/utils';
import { Badge, type BadgeProps } from './badge';
import { toneBadgeClass, type StatusTone } from './status-tone';

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** One of the six shared meanings — the only way a status gets its colour. */
  tone: StatusTone;
}

/**
 * StatusBadge — a `Badge` coloured by status tone. The label is always text; icons inside it are 12 px
 * (`h-3 w-3`).
 */
export function StatusBadge({ tone, className, ...props }: StatusBadgeProps) {
  return <Badge variant="outline" data-tone={tone} className={cn(toneBadgeClass(tone), className)} {...props} />;
}
