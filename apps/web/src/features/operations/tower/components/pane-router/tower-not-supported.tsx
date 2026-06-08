'use client';

import { useRouter } from 'next/navigation';
import { Map as MapIcon, MessagesSquare, Package, Truck } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { useSallyStore } from '@/features/platform/sally-ai/store';

/**
 * Shown at viewports under 900px wide. Tower's three live surfaces don't
 * fold gracefully onto a phone — instead of a broken layout we hand the
 * dispatcher off to the focused tools that DO work small: Sally chat for
 * questions, and the Loads / Fleet indexes for the underlying records.
 */
export function TowerNotSupported() {
  const router = useRouter();
  const expandStrip = useSallyStore((s) => s.expandStrip);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <MapIcon className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>

      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">Tower needs a wider screen</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          The live spine, map, and wire need at least 900px side by side. Jump to a focused view instead.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button variant="default" className="w-full justify-start" onClick={() => expandStrip('orb')}>
          <MessagesSquare className="mr-2 h-4 w-4" aria-hidden />
          Ask Sally
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/dispatcher/loads')}>
          <Package className="mr-2 h-4 w-4" aria-hidden />
          Loads
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/dispatcher/fleet')}>
          <Truck className="mr-2 h-4 w-4" aria-hidden />
          Fleet
        </Button>
      </div>
    </div>
  );
}
