'use client';

import { useState, useRef, useCallback } from 'react';
import { CountryCode, parsePhoneNumber } from 'libphonenumber-js';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { cn } from '@appshore/web-core/shared/lib/utils';
import { toE164, formatAsYouType } from '@app/ui/lib/phone';

interface Country {
  code: CountryCode;
  flag: string;
  dialCode: string;
  placeholder: string;
  maxDigits: number;
}

const COUNTRIES: Country[] = [
  { code: 'US', flag: '🇺🇸', dialCode: '+1', placeholder: '(555) 555-5555', maxDigits: 10 },
  { code: 'IN', flag: '🇮🇳', dialCode: '+91', placeholder: '98765 43210', maxDigits: 10 },
];

function _detectCountryFromE164(e164: string): Country | undefined {
  try {
    const parsed = parsePhoneNumber(e164);
    if (parsed?.country) {
      return COUNTRIES.find((c) => c.code === parsed.country);
    }
  } catch {
    // ignore
  }
  return undefined;
}

interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: CountryCode;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'US',
  disabled = false,
  placeholder,
  className,
  id,
}: PhoneInputProps) {
  const defaultC = COUNTRIES.find((c) => c.code === defaultCountry) ?? COUNTRIES[0];

  // Parse initial value to extract country and digits
  const getInitial = () => {
    if (!value) return { country: defaultC, digits: '' };
    try {
      const parsed = parsePhoneNumber(value);
      if (parsed) {
        const c = COUNTRIES.find((co) => co.code === parsed.country) ?? defaultC;
        return { country: c, digits: parsed.nationalNumber };
      }
    } catch {
      /* ignore */
    }
    return { country: defaultC, digits: '' };
  };

  const initial = getInitial();
  const [country, setCountry] = useState<Country>(initial.country);
  const [digits, setDigits] = useState(initial.digits);
  const [touched, setTouched] = useState(false);
  // Track whether user is interacting — prevents external value sync from wiping input
  const userInteracting = useRef(false);
  // Track last value we sent to parent to avoid sync loops
  const lastSentValue = useRef(value);

  // Sync from parent only when value genuinely changes externally (e.g. form reset, sheet open)
  // NOT when we ourselves triggered the change
  const prevValue = useRef(value);
  if (value !== prevValue.current && value !== lastSentValue.current && !userInteracting.current) {
    prevValue.current = value;
    if (value) {
      try {
        const parsed = parsePhoneNumber(value);
        if (parsed) {
          const c = COUNTRIES.find((co) => co.code === parsed.country) ?? defaultC;
          setCountry(c);
          setDigits(parsed.nationalNumber);
        }
      } catch {
        /* ignore */
      }
    } else {
      setDigits('');
      setCountry(defaultC);
    }
  }
  prevValue.current = value;

  const display = digits.length > 0 ? formatAsYouType(digits, country.code) : '';

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      userInteracting.current = true;
      const raw = e.target.value;
      const newDigits = raw.replace(/\D/g, '');
      const prevDigits = digits;

      let result = newDigits;

      // If user deleted a formatting char (digit count same, but string shorter) — drop last digit
      if (newDigits.length === prevDigits.length && raw.length < display.length) {
        result = newDigits.slice(0, -1);
      }

      // Cap at max digits for country
      result = result.slice(0, country.maxDigits);

      setDigits(result);

      // Send E.164 to parent — empty string if not a complete valid number
      const e164 = toE164(result, country.code);
      const val = e164 ?? '';
      lastSentValue.current = val;
      onChange(val);
    },
    [digits, display, country, onChange],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    userInteracting.current = false;
  }, []);

  const handleFocus = useCallback(() => {
    userInteracting.current = true;
  }, []);

  const handleCountryChange = useCallback(
    (code: string) => {
      const next = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
      setCountry(next);
      setDigits('');
      lastSentValue.current = '';
      onChange('');
    },
    [onChange],
  );

  const isInvalid = touched && digits.length > 0 && !toE164(digits, country.code);

  return (
    <div className={cn('flex gap-2', className)}>
      <Select value={country.code} onValueChange={handleCountryChange} disabled={disabled}>
        <SelectTrigger className="w-[90px] shrink-0">
          <SelectValue>
            {country.flag} {country.dialCode}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.flag} {c.dialCode}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder ?? country.placeholder}
        disabled={disabled}
        className={cn(isInvalid && 'border-critical focus-visible:ring-critical')}
        autoComplete="tel"
      />
    </div>
  );
}
