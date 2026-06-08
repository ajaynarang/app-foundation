'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send, X } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { useSubmitFeedback } from '../hooks/use-submit-feedback';

export const FEEDBACK_VARIANT = {
  SEGMENT: 'segment',
  PLAN: 'plan',
} as const;

type FeedbackVariant = (typeof FEEDBACK_VARIANT)[keyof typeof FEEDBACK_VARIANT];

const FEEDBACK_LABELS: Record<FeedbackVariant, { good: string; bad: string }> = {
  [FEEDBACK_VARIANT.SEGMENT]: { good: 'Good call', bad: 'Bad call' },
  [FEEDBACK_VARIANT.PLAN]: { good: 'Good plan', bad: 'Bad plan' },
};

interface DecisionFeedbackProps {
  planId: string;
  segmentId: string;
  /** 'segment' = per-decision feedback, 'plan' = overall route feedback */
  variant?: FeedbackVariant;
}

export function DecisionFeedback({ planId, segmentId, variant = FEEDBACK_VARIANT.SEGMENT }: DecisionFeedbackProps) {
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [reason, setReason] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<'good' | 'bad' | null>(null);

  const { mutate: submitFeedback, isPending } = useSubmitFeedback();

  const handleRating = (value: 'good' | 'bad') => {
    // If clicking same as last submitted, just toggle the UI state
    if (rating === value && lastSubmitted === value) {
      setRating(null);
      setShowInput(false);
      return;
    }

    setRating(value);
    if (value === 'good') {
      setShowInput(false);
      setReason('');
      submitFeedback({ planId, segmentId, data: { rating: 'good' } }, { onSuccess: () => setLastSubmitted('good') });
    } else {
      setShowInput(true);
    }
  };

  const handleSubmitBad = () => {
    submitFeedback(
      { planId, segmentId, data: { rating: 'bad', reason: reason || undefined } },
      {
        onSuccess: () => {
          setLastSubmitted('bad');
          setShowInput(false);
        },
      },
    );
  };

  const resetBadInput = () => {
    setRating(null);
    setShowInput(false);
    setReason('');
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={`h-6 text-[11px] px-2 gap-1 ${
            lastSubmitted === 'good'
              ? 'border-emerald-500 dark:border-emerald-400 text-emerald-500 dark:text-emerald-400 bg-emerald-500/10'
              : ''
          }`}
          onClick={() => handleRating('good')}
          loading={isPending && rating === 'good'}
          disabled={lastSubmitted === 'good'}
        >
          <ThumbsUp className="h-3 w-3" />
          {FEEDBACK_LABELS[variant].good}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`h-6 text-[11px] px-2 gap-1 ${
            lastSubmitted === 'bad' ? 'border-critical text-critical bg-critical/10' : ''
          }`}
          onClick={() => handleRating('bad')}
          disabled={lastSubmitted === 'bad'}
        >
          <ThumbsDown className="h-3 w-3" />
          {FEEDBACK_LABELS[variant].bad}
        </Button>
        {lastSubmitted && <span className="text-2xs text-emerald-500 dark:text-emerald-400 ml-1">✓ Sent</span>}
        <span className="text-2xs text-muted-foreground ml-auto">Help Sally learn</span>
      </div>

      {showInput && (
        <div className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What would you do instead?"
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitBad()}
          />
          <Button variant="default" size="sm" className="h-7 px-2" onClick={handleSubmitBad} loading={isPending}>
            <Send className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={resetBadInput}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
