'use client';

import { Eye, Sparkles, Bug, Lightbulb, MessageCircle, HelpCircle } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { cn } from '@sally/ui';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { useMarkReviewed, useCategorizeFeedback, useUpdateCategory } from '../hooks/use-admin-feedback';
import { ResolvePopover } from './resolve-popover';
import type { Feedback } from '../types';

interface FeedbackCardProps {
  feedback: Feedback;
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-500 animate-pulse',
  reviewed: 'bg-muted-foreground/50',
  resolved: 'bg-green-500',
};

const UNCATEGORIZED = {
  icon: HelpCircle,
  color: 'text-amber-500',
  border: 'border-l-amber-500',
  label: 'Uncategorized',
};

const CATEGORY_CONFIG: Record<string, { icon: typeof Bug; color: string; border: string; label: string }> = {
  bug: { icon: Bug, color: 'text-red-500', border: 'border-l-red-500', label: 'Bug' },
  idea: { icon: Lightbulb, color: 'text-blue-500', border: 'border-l-blue-500', label: 'Idea' },
  general: { icon: MessageCircle, color: 'text-muted-foreground', border: 'border-l-border', label: 'General' },
};

const SENTIMENT_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-lime-500',
  5: 'bg-green-500',
};

function getInitials(first?: string, last?: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

export function FeedbackCard({ feedback }: FeedbackCardProps) {
  const { mutate: markReviewed, isPending: isMarking } = useMarkReviewed();
  const { mutate: categorize, isPending: isCategorizing } = useCategorizeFeedback();
  const { mutate: updateCategory } = useUpdateCategory();

  const cat = feedback.category ? CATEGORY_CONFIG[feedback.category] || CATEGORY_CONFIG.general : UNCATEGORIZED;
  const CatIcon = cat.icon;

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 space-y-3 border-l-4', cat.border)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', STATUS_STYLES[feedback.status])} />
          <span className="text-xs font-medium uppercase text-muted-foreground">{feedback.status}</span>
          <Badge variant="outline" className={cn('text-xs gap-1', cat.color)}>
            <CatIcon className="h-3 w-3" />
            {cat.label}
          </Badge>
          <span
            className={cn('h-2.5 w-2.5 rounded-full', SENTIMENT_COLORS[feedback.sentiment])}
            title={`Sentiment: ${feedback.sentiment}/5`}
          />
        </div>
        <span className="text-xs text-muted-foreground">{formatRelativeTime(feedback.createdAt)}</span>
      </div>

      <p className="text-sm text-foreground line-clamp-3">{feedback.message}</p>

      {feedback.page && (
        <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{feedback.page}</code>
      )}

      {feedback.user && (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
          <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium text-foreground shrink-0">
            {getInitials(feedback.user.firstName, feedback.user.lastName)}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {feedback.user.firstName} {feedback.user.lastName}
              <span className="text-muted-foreground font-normal"> · {feedback.user.role}</span>
            </p>
            {feedback.tenant && <p className="text-xs text-muted-foreground">{feedback.tenant.companyName}</p>}
            <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
              {feedback.user.email && <span>{feedback.user.email}</span>}
              {feedback.user.phone && <span>{feedback.user.phone}</span>}
            </div>
          </div>
        </div>
      )}

      {feedback.status === 'RESOLVED' && feedback.note && (
        <div className="p-3 rounded-md bg-green-500/5 border border-green-500/20">
          <p className="text-xs font-medium text-green-500 mb-1">Resolved</p>
          <p className="text-sm text-foreground">{feedback.note}</p>
          {feedback.resolver && (
            <p className="text-xs text-muted-foreground mt-1">
              by {feedback.resolver.firstName} {feedback.resolver.lastName}
            </p>
          )}
        </div>
      )}

      {feedback.status !== 'RESOLVED' && (
        <div className="flex items-center gap-2 pt-1">
          {feedback.status === 'NEW' && (
            <Button variant="outline" size="sm" onClick={() => markReviewed(feedback.id)} loading={isMarking}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              Mark Read
            </Button>
          )}
          <ResolvePopover feedbackId={feedback.id}>
            <Button variant="outline" size="sm">
              Resolve
            </Button>
          </ResolvePopover>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => categorize(feedback.id)}
              loading={isCategorizing}
              title="AI Categorize"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
            <Select
              value={feedback.category ?? ''}
              onValueChange={(val) => updateCategory({ id: feedback.id, category: val as 'bug' | 'idea' | 'general' })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="Set..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
