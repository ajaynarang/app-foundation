'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { EmailIngestFilterResult, EmailIngestParseStatus } from '../types';

interface EmailFilterBadgeProps {
  filterResult: EmailIngestFilterResult;
  parseStatus: EmailIngestParseStatus;
}

function getBadgeConfig(
  filterResult: EmailIngestFilterResult,
  parseStatus: EmailIngestParseStatus,
): { className: string; label: string } {
  if (filterResult === 'PASSED') {
    switch (parseStatus) {
      case 'PARSED':
        return { className: 'bg-emerald-500/20 text-emerald-400 border-0', label: 'Parsed' };
      case 'PARSING':
        return { className: 'bg-amber-500/20 text-amber-400 border-0', label: 'Parsing...' };
      case 'PENDING':
        return { className: 'bg-muted text-muted-foreground border-0', label: 'Queued' };
      case 'FAILED':
        return { className: 'bg-red-500/20 text-red-400 border-0', label: 'Failed' };
      default:
        return { className: 'bg-muted text-muted-foreground border-0', label: 'Skipped' };
    }
  }

  if (filterResult === 'SENDER_UNKNOWN') {
    return { className: 'bg-amber-500/20 text-amber-400 border-0', label: 'Unknown Sender' };
  }

  const reasonLabels: Partial<Record<EmailIngestFilterResult, string>> = {
    WRONG_TYPE: 'Wrong Type',
    TOO_SMALL: 'Too Small',
    TOO_LARGE: 'Too Large',
    DUPLICATE: 'Duplicate',
    NOT_RATECON: 'Not Rate-Con',
    BLOCKED_NAME: 'Blocked',
    PENDING: 'Pending',
  };

  return {
    className: 'bg-muted text-muted-foreground border-0',
    label: reasonLabels[filterResult] ?? 'Skipped',
  };
}

export function EmailFilterBadge({ filterResult, parseStatus }: EmailFilterBadgeProps) {
  const { className, label } = getBadgeConfig(filterResult, parseStatus);

  return (
    <Badge variant="outline" className={`text-2xs px-1.5 py-0 ${className}`}>
      {label}
    </Badge>
  );
}
