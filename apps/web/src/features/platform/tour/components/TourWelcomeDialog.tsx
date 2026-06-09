'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@app/ui/components/ui/dialog';
import { Button } from '@app/ui/components/ui/button';
import { AssistantOrb } from '@/features/platform/ai-chat/components/AssistantOrb';
import { useTour } from '../hooks/use-tour';

interface TourWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TourWelcomeDialog({ open, onOpenChange }: TourWelcomeDialogProps) {
  const { startTour, dismissTour } = useTour();

  const handleStart = () => {
    onOpenChange(false);
    setTimeout(() => startTour(), 300);
  };

  const handleDismiss = () => {
    onOpenChange(false);
    dismissTour();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden border-0 bg-gradient-to-b from-card to-background p-0">
        {/* Ambient glow background */}
        <motion.div
          className="absolute inset-0 opacity-20 dark:opacity-10"
          animate={{
            background: [
              'radial-gradient(circle at 30% 30%, rgba(120,120,120,0.3) 0%, transparent 60%)',
              'radial-gradient(circle at 70% 70%, rgba(120,120,120,0.3) 0%, transparent 60%)',
              'radial-gradient(circle at 30% 30%, rgba(120,120,120,0.3) 0%, transparent 60%)',
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative flex flex-col items-center gap-5 px-8 py-10">
          {/* Assistant Orb — real deal, not an emoji */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          >
            <AssistantOrb state="listening" size="lg" />
          </motion.div>

          <motion.div
            className="text-center space-y-2"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <DialogTitle className="text-2xl font-bold text-foreground tracking-tight">Meet the Assistant</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Your AI-powered platform. Let me walk you through everything — it&apos;ll take less than 2 minutes.
            </DialogDescription>
          </motion.div>

          <motion.div
            className="flex gap-3 pt-2"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <Button variant="outline" onClick={handleDismiss} className="px-6">
              Maybe Later
            </Button>
            <Button onClick={handleStart} className="px-6">
              Show Me Around
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
