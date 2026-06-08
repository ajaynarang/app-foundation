'use client';

import { useEffect, useState, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { STORAGE_KEYS } from '@/shared/constants/storage-keys';

const BASE_FONT_SIZE = 13;
const MIN_SCALE = 80;
const MAX_SCALE = 120;
const STEP = 5;
const DEFAULT_SCALE = 100;

function applyScale(scale: number) {
  document.documentElement.style.fontSize = `${(BASE_FONT_SIZE * scale) / 100}px`;
}

export function FontSizeControl() {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.FONT_SIZE_SCALE);
    const initial = stored ? Number(stored) : DEFAULT_SCALE;
    setScale(initial);
    applyScale(initial);
    setMounted(true);
  }, []);

  const updateScale = useCallback((next: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    setScale(clamped);
    applyScale(clamped);
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE_SCALE, String(clamped));
  }, []);

  if (!mounted) {
    return <div className="flex items-center gap-1 h-7" />;
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => updateScale(scale - STEP)}
        disabled={scale <= MIN_SCALE}
        title="Decrease font size"
        aria-label="Decrease font size"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-center select-none">{scale}%</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => updateScale(scale + STEP)}
        disabled={scale >= MAX_SCALE}
        title="Increase font size"
        aria-label="Increase font size"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default FontSizeControl;
