'use client';

import React, { useRef, useEffect } from 'react';
import { Input } from '@app/ui/components/ui/input';
import { cn } from '@app/ui';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'large';
}

export function PinInput({ value, onChange, disabled, className, size = 'default' }: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split('').concat(['', '', '', '']).slice(0, 4);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const boxClass =
    size === 'large' ? 'w-16 h-20 text-center text-3xl font-mono' : 'w-12 h-14 text-center text-2xl font-mono';

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    onChange(newDigits.join(''));
    if (char && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className={cn('flex justify-center gap-3', className)}>
      {digits.map((digit, i) => (
        <Input
          key={i}
          ref={(el: HTMLInputElement | null) => {
            inputRefs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          aria-label={`PIN digit ${i + 1}`}
          className={boxClass}
        />
      ))}
    </div>
  );
}
