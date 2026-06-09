'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { CardComponentProps } from 'onborda';
import { Button } from '@app/ui/components/ui/button';
import { Progress } from '@app/ui/components/ui/progress';
import { AssistantOrb } from '@/features/platform/ai-chat/components/AssistantOrb';
import { cn } from '@app/ui';
import { useTour } from '../hooks/use-tour';

const TYPEWRITER_SPEED = 25;

function useTypewriter(text: string) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayedText('');
    setIsComplete(false);
    let index = 0;

    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, TYPEWRITER_SPEED);

    return () => clearInterval(interval);
  }, [text]);

  const skipToEnd = useCallback(() => {
    setDisplayedText(text);
    setIsComplete(true);
  }, [text]);

  return { displayedText, isComplete, skipToEnd };
}

export function AssistantTourCard({ step, currentStep, totalSteps, nextStep, prevStep, arrow }: CardComponentProps) {
  const router = useRouter();
  const { dismissTour, completeTour } = useTour();
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const content = typeof step.content === 'string' ? step.content : '';
  const { displayedText, isComplete, skipToEnd } = useTypewriter(content);
  const [isNavigating, setIsNavigating] = useState(false);

  const progressPercent = ((currentStep + 1) / totalSteps) * 100;

  // Prefetch next and previous routes for instant transitions
  useEffect(() => {
    if (step.nextRoute) router.prefetch(step.nextRoute);
    if (step.prevRoute) router.prefetch(step.prevRoute);
  }, [step.nextRoute, step.prevRoute, router]);

  // Reset navigating state when step changes
  useEffect(() => {
    setIsNavigating(false);
  }, [currentStep]);

  // Safety timeout: if navigation takes too long (selector not found), reset
  useEffect(() => {
    if (!isNavigating) return;
    const timeout = setTimeout(() => setIsNavigating(false), 3000);
    return () => clearTimeout(timeout);
  }, [isNavigating]);

  const handleNext = () => {
    if (step.nextRoute) setIsNavigating(true);
    nextStep();
  };

  const handlePrev = () => {
    if (step.prevRoute) setIsNavigating(true);
    prevStep();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'w-[400px] rounded-xl border border-border bg-card text-card-foreground shadow-2xl',
        'backdrop-blur-sm',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <AssistantOrb state={isNavigating ? 'thinking' : 'idle'} size="sm" />
          <span className="text-sm font-semibold text-foreground">Assistant</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {/* Content */}
      <div className="px-5 pb-3">
        <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
        <div className="min-h-[60px]" onClick={!isComplete ? skipToEnd : undefined}>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {displayedText}
            {!isComplete && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="inline-block w-0.5 h-4 bg-foreground ml-0.5 align-text-bottom"
              />
            )}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 pb-4">
        <Button variant="ghost" size="sm" onClick={dismissTour} className="text-muted-foreground hover:text-foreground">
          Skip Tour
        </Button>
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={isNavigating}>
              ← Back
            </Button>
          )}
          {isLastStep ? (
            <Button size="sm" onClick={completeTour}>
              Let&apos;s Go!
            </Button>
          ) : (
            <Button size="sm" onClick={handleNext} disabled={isNavigating}>
              {isNavigating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Loading…
                </>
              ) : (
                'Next →'
              )}
            </Button>
          )}
        </div>
      </div>

      {arrow}
    </motion.div>
  );
}
