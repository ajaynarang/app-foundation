'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { useSallyStore } from '@/features/platform/sally-ai/store';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

/**
 * Per-report prompts grounded in what Sally's MCP tools can actually fetch.
 * Each prompt guides Sally to use the right tools (query-loads, query-invoices, etc.)
 * and ask a question a dispatcher would actually care about.
 */
const REPORT_PROMPTS: Record<string, string> = {
  revenue:
    'Pull my recent invoices and loads for {period}. Who are my top-paying customers, what are my highest-value loads, and how is revenue trending?',
  profitability:
    'Look at my delivered loads for {period}. Which loads had the best and worst rates? Are there any customers or lanes where I should be charging more?',
  drivers:
    'Check on my drivers for {period}. How are their hours looking, who has the most loads, and are there any HOS compliance concerns I should know about?',
  fleet:
    'Give me a fleet status check. Which vehicles are available, which are in use, and do I have any trucks sitting idle that I should get moving?',
  customers:
    'Review my customers for {period}. Who is generating the most revenue, are there any with overdue invoices, and who should I prioritize?',
  lanes:
    'Look at my recent loads for {period}. What are my most common routes, which lanes have the best rates, and are there any deadhead patterns I should address?',
  'ar-health':
    'Check my overdue invoices and AR health right now. Who owes me money, how long have the oldest ones been sitting, what is my days-sales-outstanding trending toward, and which ones should I follow up on first?',
};

interface AskSallyButtonProps {
  /** Report config key (e.g., 'revenue', 'ar-health') */
  reportKey: string;
  dateFrom?: string;
  dateTo?: string;
}

export function AskSallyButton({ reportKey, dateFrom, dateTo }: AskSallyButtonProps) {
  const expandStrip = useSallyStore((s) => s.expandStrip);
  const setDraftInput = useSallyStore((s) => s.setDraftInput);
  const { formatDate } = useFormatters();

  function buildPeriodLabel(): string {
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
    if (dateFrom) return `${formatDate(dateFrom)} to today`;
    return 'the last 30 days';
  }

  function handleClick() {
    const period = buildPeriodLabel();
    const template = REPORT_PROMPTS[reportKey] ?? REPORT_PROMPTS.revenue;
    const prompt = template.replace('{period}', period);

    setDraftInput(prompt);
    expandStrip('tab');
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Sparkles className="mr-2 h-4 w-4" />
      Ask Sally
    </Button>
  );
}
