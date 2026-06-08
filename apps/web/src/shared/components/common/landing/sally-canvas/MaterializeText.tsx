'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface MaterializeTextProps {
  children: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  className?: string;
  delay?: number;
  duration?: number;
  letterByLetter?: boolean;
  wordByWord?: boolean;
}

export function MaterializeText({
  children,
  as: Tag = 'p',
  className = '',
  delay = 0,
  duration = 0.8,
  letterByLetter = false,
  wordByWord = false,
}: MaterializeTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  if (letterByLetter) {
    const letters = children.split('');
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Tag className={className} ref={ref as any}>
        {letters.map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: 'blur(12px)' }}
            animate={isInView ? { opacity: 1, filter: 'blur(0px)' } : {}}
            transition={{
              duration: 0.5,
              delay: delay + i * 0.08,
              ease: 'easeOut',
            }}
            style={{ display: 'inline-block' }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </motion.span>
        ))}
      </Tag>
    );
  }

  if (wordByWord) {
    const words = children.split(' ');
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Tag className={className} ref={ref as any}>
        {words.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: 'blur(8px)', y: 4 }}
            animate={isInView ? { opacity: 1, filter: 'blur(0px)', y: 0 } : {}}
            transition={{
              duration: 0.4,
              delay: delay + i * 0.06,
              ease: 'easeOut',
            }}
            style={{ display: 'inline-block', marginRight: '0.3em' }}
          >
            {word}
          </motion.span>
        ))}
      </Tag>
    );
  }

  // Default: whole text materializes from blur
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, filter: 'blur(20px)', scale: 0.95 }}
      animate={isInView ? { opacity: 1, filter: 'blur(0px)', scale: 1 } : {}}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      <Tag className={className}>{children}</Tag>
    </motion.div>
  );
}
