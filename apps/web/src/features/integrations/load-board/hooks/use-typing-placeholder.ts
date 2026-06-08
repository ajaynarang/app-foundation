import { useState, useEffect, useRef } from 'react';

const PLACEHOLDER_EXAMPLES = [
  'reefer loads from Memphis to Atlanta paying $3+',
  'flatbed in Chicago, 48k lbs',
  'van loads to Dallas under 500 miles',
  'Chicago, IL',
  'loads paying over $2.50/mi near Nashville',
  'step deck from Denver to Kansas City',
  'Memphis, TN → Atlanta, GA',
  'dry van loads in LA area',
];

/** Cycles through placeholder examples with a typing animation */
export function useTypingPlaceholder(isActive: boolean) {
  const [text, setText] = useState('');
  const indexRef = useRef(0);
  const charRef = useRef(0);
  const phaseRef = useRef<'typing' | 'holding' | 'erasing'>('typing');
  const frameRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isActive) {
      setText('');
      return;
    }

    const tick = () => {
      const example = PLACEHOLDER_EXAMPLES[indexRef.current];
      const phase = phaseRef.current;

      if (phase === 'typing') {
        charRef.current++;
        setText(example.slice(0, charRef.current));
        if (charRef.current >= example.length) {
          phaseRef.current = 'holding';
          frameRef.current = setTimeout(tick, 2000);
          return;
        }
        frameRef.current = setTimeout(tick, 40 + Math.random() * 30);
      } else if (phase === 'holding') {
        phaseRef.current = 'erasing';
        frameRef.current = setTimeout(tick, 30);
      } else {
        charRef.current--;
        setText(example.slice(0, charRef.current));
        if (charRef.current <= 0) {
          indexRef.current = (indexRef.current + 1) % PLACEHOLDER_EXAMPLES.length;
          phaseRef.current = 'typing';
          frameRef.current = setTimeout(tick, 400);
          return;
        }
        frameRef.current = setTimeout(tick, 20);
      }
    };

    frameRef.current = setTimeout(tick, 800);

    return () => {
      if (frameRef.current) clearTimeout(frameRef.current);
    };
  }, [isActive]);

  return text;
}
