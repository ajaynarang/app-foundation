'use client';

import React, { useRef } from 'react';
import { Input } from '@sally/ui/components/ui/input';
import { cn } from '@sally/ui';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'large';
}

export function OtpInput({ length = 6, value, onChange, disabled, className, size = 'default' }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  const boxClass =
    size === 'large'
      ? 'w-14 h-16 text-center text-2xl font-mono border-2 border-border bg-background text-foreground focus:border-foreground'
      : 'w-10 h-12 text-center text-lg font-mono border-2 border-border bg-background text-foreground focus:border-foreground';

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    onChange(newDigits.join(''));
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted.padEnd(length, '').slice(0, length));
    const nextIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={cn('flex justify-center gap-2', className)}>
      {digits.map((digit, i) => (
        <Input
          key={i}
          ref={(el: HTMLInputElement | null) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={boxClass}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
