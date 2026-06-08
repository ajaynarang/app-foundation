'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Clock } from 'lucide-react';
import { showSuccess } from '@sally/ui';

interface MoneyCodeDisplayProps {
  code: string;
  amountCents: number;
  method: string;
  expiresAt?: string | null;
}

export function MoneyCodeDisplay({ code, amountCents, method, expiresAt }: MoneyCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      showSuccess('Code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      showSuccess('Code copied');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // Expiry countdown
  const expiryLabel = expiresAt ? getExpiryLabel(expiresAt) : null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full rounded-xl border border-border bg-card p-4 text-center transition-all active:scale-[0.98] hover:bg-muted/50"
    >
      <p className="text-2xl font-mono font-bold text-foreground tracking-[0.15em] select-all">{code}</p>
      <div className="flex items-center justify-center gap-2 mt-2">
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{copied ? 'Copied!' : 'Tap to copy'}</span>
      </div>
      <div className="flex items-center justify-center gap-3 mt-3 text-xs text-muted-foreground">
        <span>${(amountCents / 100).toFixed(2)}</span>
        <span>·</span>
        <span className="uppercase">{method}</span>
        {expiryLabel && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {expiryLabel}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function getExpiryLabel(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
