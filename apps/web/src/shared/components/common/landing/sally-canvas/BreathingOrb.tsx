'use client';

import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

interface Conversation {
  role: string;
  question: string;
  answer: string;
}

const conversations: Conversation[] = [
  {
    role: 'Dispatcher',
    question: 'Is Route #1247 on track?',
    answer: 'Route #1247 is on track. Currently at Stop 3 of 7. ETA 3:45 PM — on schedule with 1.2hr buffer.',
  },
  {
    role: 'Driver',
    question: 'Where should I take my 10-hour break?',
    answer: "Love's Travel Stop at Exit 47. 2.3 hours ahead. Keeps you compliant and on schedule after rest.",
  },
];

export function BreathingOrb() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [activeConversation, setActiveConversation] = useState(0);
  const [phase, setPhase] = useState<'question' | 'thinking' | 'answer'>('question');
  const [visibleWords, setVisibleWords] = useState(0);

  const current = conversations[activeConversation];

  useEffect(() => {
    if (!isInView) return;

    const cycle = () => {
      // Show question
      setPhase('question');
      setVisibleWords(0);

      // Start "thinking"
      const thinkTimer = setTimeout(() => {
        setPhase('thinking');
      }, 2000);

      // Start answer word-by-word
      const answerTimer = setTimeout(() => {
        setPhase('answer');
        const words = conversations[activeConversation].answer.split(' ');
        let wordIndex = 0;
        const wordInterval = setInterval(() => {
          wordIndex++;
          setVisibleWords(wordIndex);
          if (wordIndex >= words.length) {
            clearInterval(wordInterval);
          }
        }, 80);
      }, 3500);

      // Move to next conversation
      const nextTimer = setTimeout(() => {
        setActiveConversation((prev) => (prev + 1) % conversations.length);
      }, 9000);

      return () => {
        clearTimeout(thinkTimer);
        clearTimeout(answerTimer);
        clearTimeout(nextTimer);
      };
    };

    const cleanup = cycle();
    const interval = setInterval(() => {
      cycle();
    }, 9000);

    return () => {
      cleanup?.();
      clearInterval(interval);
    };
  }, [isInView, activeConversation]);

  const answerWords = current.answer.split(' ');

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      {/* Role indicator */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.role}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-8"
        >
          {current.role}
        </motion.div>
      </AnimatePresence>

      {/* Question floating in */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`q-${activeConversation}`}
          initial={{ opacity: 0, filter: 'blur(10px)', y: 20 }}
          animate={{ opacity: phase === 'question' ? 1 : 0.3, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="text-sm md:text-base text-muted-foreground mb-12 text-center max-w-md italic"
        >
          &ldquo;{current.question}&rdquo;
        </motion.div>
      </AnimatePresence>

      {/* The Orb */}
      <div className="relative w-32 h-32 md:w-40 md:h-40 mb-12">
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            scale: phase === 'thinking' ? [1, 1.2, 1] : phase === 'answer' ? [1, 1.08, 1] : 1,
            opacity: phase === 'thinking' ? [0.3, 0.6, 0.3] : 0.2,
          }}
          transition={{
            duration: phase === 'thinking' ? 1.2 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            background: 'radial-gradient(circle, rgba(128,128,128,0.15), transparent 70%)',
          }}
        />

        {/* Main orb */}
        <motion.div
          className="absolute inset-4 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 dark:from-gray-700 dark:to-gray-500"
          animate={{
            scale:
              phase === 'thinking'
                ? [1, 1.15, 0.95, 1.1, 1]
                : phase === 'answer'
                  ? [1, 1.03, 0.98, 1.02, 1]
                  : [1, 1.02, 1],
          }}
          transition={{
            duration: phase === 'thinking' ? 1.5 : 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            boxShadow: '0 0 60px rgba(128,128,128,0.2), inset 0 0 30px rgba(255,255,255,0.1)',
          }}
        >
          {/* Inner highlight */}
          <div
            className="absolute inset-0 rounded-full opacity-40"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), transparent 60%)',
            }}
          />
        </motion.div>

        {/* Waveform rings when speaking */}
        {phase === 'answer' && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border border-gray-300 dark:border-gray-600"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: [1, 1.5 + i * 0.2], opacity: [0.3, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Answer text materializing word by word */}
      <AnimatePresence mode="wait">
        {phase === 'answer' && (
          <motion.div
            key={`a-${activeConversation}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center max-w-lg px-4"
          >
            <p className="text-sm md:text-base text-foreground leading-relaxed">
              {answerWords.map((word, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, filter: 'blur(6px)' }}
                  animate={i < visibleWords ? { opacity: 1, filter: 'blur(0px)' } : {}}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{ display: 'inline-block', marginRight: '0.25em' }}
                >
                  {word}
                </motion.span>
              ))}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking indicator */}
      {phase === 'thinking' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
