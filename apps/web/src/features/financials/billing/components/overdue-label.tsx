'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { differenceInCalendarDays } from 'date-fns';

interface OverdueLabelProps {
  dueDate: string;
  status: string;
}

export function OverdueLabel({ dueDate, status }: OverdueLabelProps) {
  // If status is PAID, VOID, FACTORED, or DRAFT, return null (no label)
  if (['PAID', 'VOID', 'FACTORED', 'DRAFT'].includes(status)) return null;

  // Parse date-only string without timezone shift
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = differenceInCalendarDays(due, today);

  if (diffDays > 7) {
    // Far from due - show "Due in X days" in muted text (no badge)
    return <span className="text-xs text-muted-foreground">Due in {diffDays}d</span>;
  }

  if (diffDays > 0) {
    // Close to due - "Due in X days" yellow
    return (
      <Badge
        variant="outline"
        className={`text-xs ${SEMANTIC_COLORS.caution.border} ${SEMANTIC_COLORS.caution.text} ${SEMANTIC_COLORS.caution.bg}`}
      >
        Due in {diffDays}d
      </Badge>
    );
  }

  if (diffDays === 0) {
    return (
      <Badge
        variant="outline"
        className={`text-xs ${SEMANTIC_COLORS.caution.border} ${SEMANTIC_COLORS.caution.text} ${SEMANTIC_COLORS.caution.bg}`}
      >
        Due today
      </Badge>
    );
  }

  // Past due
  const overdueDays = Math.abs(diffDays);
  return (
    <Badge
      variant="outline"
      className={`text-xs ${SEMANTIC_COLORS.critical.border} ${SEMANTIC_COLORS.critical.text} ${SEMANTIC_COLORS.critical.bg}`}
    >
      {overdueDays}d overdue
    </Badge>
  );
}
