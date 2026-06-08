'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

interface ImagePreviewProps {
  url: string;
  scale: number;
  rotation: number;
}

export function ImagePreview({ url, scale, rotation }: ImagePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset position when URL changes
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setHasError(false);
  }, [url]);

  // Reset position when zoom resets to fit
  useEffect(() => {
    if (scale === 1 && rotation === 0) {
      setPosition({ x: 0, y: 0 });
    }
  }, [scale, rotation]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return; // Only pan when zoomed in
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      positionStartRef.current = { ...position };
    },
    [scale, position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPosition({
        x: positionStartRef.current.x + dx,
        y: positionStartRef.current.y + dy,
      });
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  if (hasError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <p className="text-sm font-medium">Failed to load image</p>
        <p className="text-xs">The file may be corrupted or unavailable.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center h-full w-full overflow-hidden"
      style={{ cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {isLoading && <Skeleton className="absolute h-[400px] w-[500px]" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Document preview"
        draggable={false}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        className="max-w-full max-h-full object-contain select-none transition-transform duration-150"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          opacity: isLoading ? 0 : 1,
        }}
      />
    </div>
  );
}
