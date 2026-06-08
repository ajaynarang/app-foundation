'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './button';
import { showSuccess } from '../../lib/toast';

interface CopyButtonProps {
  value: string;
  label: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    showSuccess(`${label} copied`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 px-2 shrink-0">
      {copied ? <Check className="h-4 w-4 text-info" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
