import { Badge } from '@sally/ui/components/ui/badge';
import { getSettlementStatusColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { SettlementStatus } from '../types';

const labels: Record<SettlementStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PAID: 'Paid',
  VOID: 'Void',
};

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const color = getSettlementStatusColor(status);
  const s = SEMANTIC_COLORS[color];
  return <Badge className={`${s.bg} ${s.text}`}>{labels[status]}</Badge>;
}
