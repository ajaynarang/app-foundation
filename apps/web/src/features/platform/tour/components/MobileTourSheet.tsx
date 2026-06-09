'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { Button } from '@app/ui/components/ui/button';
import { Progress } from '@app/ui/components/ui/progress';
import { AssistantOrb } from '@/features/platform/ai-chat/components/AssistantOrb';
import { useTour } from '../hooks/use-tour';
import { getStepsForRole } from '../tour-steps';
import { useAuthStore } from '@/features/auth';
import { usePlan } from '@/features/platform/plans';

const TYPEWRITER_SPEED = 20;

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

interface MobileTourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileTourSheet({ open, onOpenChange }: MobileTourSheetProps) {
  const { user } = useAuthStore();
  const { dismissTour, completeTour } = useTour();
  const { hasFeature } = usePlan();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = user?.role ? getStepsForRole(user.role, hasFeature) : [];
  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const progressPercent = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;

  const content = step?.content ?? '';
  const { displayedText, isComplete, skipToEnd } = useTypewriter(content);

  // Reset step when sheet opens
  useEffect(() => {
    if (open) setCurrentStep(0);
  }, [open]);

  const handleNext = () => {
    if (!isLastStep) setCurrentStep((s) => s + 1);
  };

  const handlePrev = () => {
    if (!isFirstStep) setCurrentStep((s) => s - 1);
  };

  const handleDismiss = () => {
    onOpenChange(false);
    dismissTour();
  };

  const handleComplete = () => {
    onOpenChange(false);
    completeTour();
  };

  if (!step) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 safe-area-bottom">
        <div className="flex flex-col">
          {/* Header */}
          <SheetHeader className="px-5 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AssistantOrb state="idle" size="sm" />
                <SheetTitle className="text-sm font-semibold">Assistant&apos;s Tour</SheetTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentStep + 1} of {steps.length}
              </span>
            </div>
          </SheetHeader>

          {/* Progress */}
          <div className="px-5 pb-4">
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          {/* Card content with animation */}
          <div className="min-h-[140px] px-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
              >
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
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
            <div className="flex gap-2">
              {!isFirstStep && (
                <Button variant="outline" size="sm" onClick={handlePrev}>
                  ← Back
                </Button>
              )}
              {isLastStep ? (
                <Button size="sm" onClick={handleComplete}>
                  Let&apos;s Go!
                </Button>
              ) : (
                <Button size="sm" onClick={handleNext}>
                  Next →
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
