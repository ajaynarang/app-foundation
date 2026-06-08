import { Badge } from '@sally/ui/components/ui/badge';
import { getInvoiceStatusColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { InvoiceStatus } from '../types';

const labels: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  VIEWED: 'Viewed',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
  FACTORED: 'Factored',
  RECOURSED: 'Recourse',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const color = getInvoiceStatusColor(status);
  const s = SEMANTIC_COLORS[color];
  return <Badge className={`${s.bg} ${s.text}`}>{labels[status]}</Badge>;
}
