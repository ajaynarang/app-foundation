'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { getIftaFilingStatusColor, SEMANTIC_COLORS } from '@/shared/lib/colors';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  CALCULATING: 'Calculating',
  DRAFT: 'Draft',
  REVIEWED: 'Reviewed',
  FILED: 'Filed',
  CONFIRMED: 'Confirmed',
  AMENDED: 'Amended',
};

export function IftaFilingStatusBadge({ status }: { status: string }) {
  const color = getIftaFilingStatusColor(status);
  const s = SEMANTIC_COLORS[color];
  return <Badge className={`${s.bg} ${s.text}`}>{STATUS_LABELS[status] ?? status}</Badge>;
}
