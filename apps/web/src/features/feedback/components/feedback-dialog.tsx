'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Slider } from '@sally/ui/components/ui/slider';
import { cn } from '@sally/ui';
import { useCreateFeedback } from '../hooks/use-feedback';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TRACK_COLORS: Record<number, string> = {
  1: '[&_[role=slider]]:bg-red-500 [&_.range]:bg-red-500',
  2: '[&_[role=slider]]:bg-orange-500 [&_.range]:bg-orange-500',
  3: '[&_[role=slider]]:bg-amber-500 [&_.range]:bg-amber-500',
  4: '[&_[role=slider]]:bg-lime-500 [&_.range]:bg-lime-500',
  5: '[&_[role=slider]]:bg-green-500 [&_.range]:bg-green-500',
};

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const pathname = usePathname();
  const [sentiment, setSentiment] = useState(3);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: createFeedback, isPending } = useCreateFeedback({
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setTimeout(() => {
          setSubmitted(false);
          setSentiment(3);
          setMessage('');
        }, 200);
      }, 1500);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!message.trim() || isPending) return;
    createFeedback({ sentiment, message: message.trim(), page: pathname });
  }, [message, isPending, sentiment, pathname, createFeedback]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [message]);

  // Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSubmit();
      }
    };
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleSubmit]);

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in-50 duration-300">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground animate-in fade-in-0 duration-500">
              Thanks! We&apos;ll take a look.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-center">How are you feeling about Sally?</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="space-y-3">
            <Slider
              value={[sentiment]}
              onValueChange={([v]) => setSentiment(v)}
              min={1}
              max={5}
              step={1}
              className={cn('w-full', TRACK_COLORS[sentiment])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Frustrated</span>
              <span>Okay</span>
              <span>Love it</span>
            </div>
          </div>

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us more..."
            className="min-h-[80px] resize-none"
            rows={3}
            autoFocus
          />

          <Button onClick={handleSubmit} disabled={!message.trim() || isPending} loading={isPending} className="w-full">
            Send
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>

          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" />
            Only visible to the Sally team
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
