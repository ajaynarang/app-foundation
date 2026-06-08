'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/features/auth';
import { HomeOrb } from './HomeOrb';
import { PulseStrip } from './PulseStrip';
import { SallyInput } from '@/features/platform/sally-ai/components/SallyInput';
import { VoiceProvider } from '@/features/platform/sally-ai/voice/voice-provider';
import { ActivityFeed } from './ActivityFeed';

// ── Time-of-day greeting ──────────────────────────────────────────────────

type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'anytime';

function getTimeSlot(): TimeSlot {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'anytime';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Sub-greeting lines ────────────────────────────────────────────────────

const SUB_GREETINGS: Record<TimeSlot, string[]> = {
  morning: [
    'Your fleet is moving. Let\u2019s keep it that way.',
    'Routes are set. Drivers are rolling.',
    'Another day on the board. Let\u2019s run it.',
    'I\u2019ve been watching the lanes. Here\u2019s what\u2019s up.',
    'Coffee\u2019s on you, dispatching\u2019s on me.',
    'Let\u2019s get wheels turning.',
    'Early bird gets the freight.',
    'Loads won\u2019t dispatch themselves. Well, actually\u2026',
    'Fresh day, fresh routes.',
    'I pulled the overnight numbers. We\u2019re looking good.',
    'Your drivers are checked in. Let\u2019s move.',
    'The board is warm. Let\u2019s work it.',
    'Sun\u2019s up, trucks are out.',
    'I kept watch while you were away.',
    'Ready to roll when you are.',
  ],
  afternoon: [
    'Halfway through. How\u2019s the day shaping up?',
    'Afternoon check-in. Everything\u2019s tracking.',
    'The hard part\u2019s done. Let\u2019s finish strong.',
    'Your loads are in motion. I\u2019m on it.',
    'Still here, still watching the routes.',
    'Post-lunch push. Let\u2019s keep the momentum.',
    'Deliveries landing, pickups queued.',
    'Second half. Let\u2019s close some loads.',
    'The afternoon lanes are looking open.',
    'Miles are stacking up nicely today.',
    'Your fleet\u2019s making good time.',
    'Nothing flagged. Smooth sailing so far.',
    'Back at it. What needs your attention?',
    'Loads are moving, invoices are building.',
    'We\u2019re in the rhythm now.',
  ],
  evening: [
    'Wrapping up? I\u2019ll keep watch.',
    'End-of-day numbers are looking solid.',
    'Your drivers are closing out their routes.',
    'Almost done. Let\u2019s button things up.',
    'Late shift? I\u2019m not going anywhere.',
    'The day\u2019s loads are nearly settled.',
    'Winding down, but the fleet never sleeps.',
    'Good run today. Let\u2019s tie up loose ends.',
    'Evening check \u2014 everything\u2019s on track.',
    'I\u2019ll hold it down from here.',
  ],
  anytime: [
    'Say the word.',
    'I\u2019m here. What\u2019s the play?',
    'Ready when you are.',
    'Let\u2019s make today count.',
    'Your operation, your call. I\u2019m backup.',
    'Freight doesn\u2019t sleep. Neither do I.',
    'What do you need? I\u2019m on it.',
    'Standing by.',
    'The board is yours.',
    'Let\u2019s get to work.',
  ],
};

/** Pick a random sub-greeting for the current time slot, stable per mount. */
function pickSubGreeting(): string {
  const slot = getTimeSlot();
  const lines = SUB_GREETINGS[slot];
  return lines[Math.floor(Math.random() * lines.length)];
}

// ── Props ─────────────────────────────────────────────────────────────────

interface VoidIdleProps {
  onEnterChat: (message: string) => void;
  onNavigate: (href: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function VoidIdle({ onEnterChat, onNavigate }: VoidIdleProps) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.firstName ?? '';

  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();
  // Stable per mount — won't flicker on re-renders
  const subGreeting = useMemo(() => pickSubGreeting(), []);

  return (
    <motion.div
      // Fill the scrollable main's remaining viewport.
      // AppLayout: h-dvh → header h-14 (56px) → main (flex-1) → PageTransition (p-4 md:p-8).
      // So the available height inside PageTransition is dvh - 56px - (32px mobile | 64px desktop).
      className="relative flex min-h-[calc(100dvh-88px)] md:min-h-[calc(100dvh-120px)] w-full flex-col items-center justify-center px-4 sm:px-6"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Ambient dot grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Radial glow behind orb area */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(120,120,120,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Content stack */}
      <div className="relative z-10 flex w-full max-w-[768px] flex-col items-center gap-6">
        <HomeOrb />
        <h1 className="text-center text-2xl font-semibold text-foreground sm:text-3xl">{greeting}</h1>
        <p className="text-center text-sm text-muted-foreground/70 -mt-2 italic">{subGreeting}</p>
        <PulseStrip onNavigate={onNavigate} />
        <div className="w-full">
          <VoiceProvider>
            <SallyInput variant="home" onEnterChat={onEnterChat} onNavigate={onNavigate} />
          </VoiceProvider>
        </div>
        <div className="w-full ">
          <ActivityFeed />
        </div>
      </div>
    </motion.div>
  );
}
