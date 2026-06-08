'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

const STRENGTH_MAP: Record<number, { label: string; color: string }> = {
  0: { label: 'Too weak', color: 'bg-critical' },
  1: { label: 'Weak', color: 'bg-critical' },
  2: { label: 'Fair', color: 'bg-caution' },
  3: { label: 'Good', color: 'bg-warning' },
  4: { label: 'Strong', color: 'bg-success' },
};

interface PasswordStrengthMeterProps {
  password: string;
  onScoreChange?: (score: number) => void;
  className?: string;
}

export function PasswordStrengthMeter({ password, onScoreChange, className }: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState<StrengthResult>({
    score: 0,
    label: '',
    color: '',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const zxcvbnRef = useRef<typeof import('@zxcvbn-ts/core').zxcvbnAsync | null>(null);
  const onScoreChangeRef = useRef(onScoreChange);
  onScoreChangeRef.current = onScoreChange;

  // Lazy-load zxcvbn on first render
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ zxcvbnAsync, zxcvbnOptions }, common, en] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);
      if (cancelled) return;
      zxcvbnOptions.setOptions({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: {
          ...common.dictionary,
          ...en.dictionary,
        },
      });
      zxcvbnRef.current = zxcvbnAsync;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Evaluate password strength with debounce
  useEffect(() => {
    if (!password) {
      setStrength({ score: 0, label: '', color: '' });
      onScoreChangeRef.current?.(0);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!zxcvbnRef.current) return;
      try {
        const result = await zxcvbnRef.current(password);
        const score = result.score as 0 | 1 | 2 | 3 | 4;
        const mapped = STRENGTH_MAP[score];
        setStrength({ score, ...mapped });
        onScoreChangeRef.current?.(score);
      } catch {
        // Fallback if zxcvbn fails
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [password]);

  return (
    <AnimatePresence>
      {password && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className={className}
        >
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((segment) => (
                <div key={segment} className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: strength.score > segment ? '100%' : '0%',
                    }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`h-full rounded-full ${strength.score > segment ? strength.color : ''}`}
                  />
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground min-w-[60px] text-right">{strength.label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
