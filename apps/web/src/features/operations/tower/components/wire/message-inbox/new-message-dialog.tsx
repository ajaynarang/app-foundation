'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useDrivers } from '@/features/fleet/drivers/hooks/use-drivers';

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A driver was picked — open their conversation thread. */
  onPick: (driverId: string) => void;
}

/**
 * "New message" driver picker for the Tower Messages tab — a searchable list
 * of fleet drivers. Picking one opens that driver's conversation thread, so a
 * dispatcher can start a message with any driver, not only those who already
 * have a thread.
 */
export function NewMessageDialog({ open, onOpenChange, onPick }: NewMessageDialogProps) {
  const { data: drivers, isLoading } = useDrivers();
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = drivers ?? [];
    return q ? list.filter((d) => d.name.toLowerCase().includes(q)) : list;
  }, [drivers, search]);

  const handlePick = (driverId: string) => {
    onPick(driverId);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drivers"
              aria-label="Search drivers"
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto px-2 pb-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No drivers match.</p>
          ) : (
            visible.map((driver) => (
              <button
                key={driver.driverId}
                type="button"
                onClick={() => handlePick(driver.driverId)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{driver.name}</span>
                {driver.status && (
                  <span className="ml-2 shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                    {driver.status}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
