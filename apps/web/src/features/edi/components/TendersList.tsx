'use client';

import { useState, useMemo } from 'react';
import { FileInput } from 'lucide-react';

import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { usePendingTenders } from '../hooks/use-edi';
import { TenderCard } from './TenderCard';
import { TenderDetailSheet } from './TenderDetailSheet';
import type { EDITender } from '../types';

type SortKey = 'expiry' | 'rate' | 'posted';

function sortTenders(tenders: EDITender[], sortBy: SortKey): EDITender[] {
  return [...tenders].sort((a, b) => {
    switch (sortBy) {
      case 'expiry': {
        // Most urgent first (earliest expiry)
        const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        return aExp - bExp;
      }
      case 'rate': {
        // Highest rate first
        const aRate = a.parsedData?.rateCents ?? a.load?.rateCents ?? 0;
        const bRate = b.parsedData?.rateCents ?? b.load?.rateCents ?? 0;
        return bRate - aRate;
      }
      case 'posted': {
        // Most recent first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      default:
        return 0;
    }
  });
}

export function TendersList() {
  const { data: tenders, isLoading } = usePendingTenders();
  const [sortBy, setSortBy] = useState<SortKey>('expiry');
  const [selectedTender, setSelectedTender] = useState<EDITender | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const sorted = useMemo(() => sortTenders(tenders ?? [], sortBy), [tenders, sortBy]);

  const handleSelect = (tender: EDITender) => {
    setSelectedTender(tender);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-full bg-muted p-4">
          <FileInput className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground">No pending tenders</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Inbound EDI 204 tenders from brokers will appear here. Accept or reject load offers in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {sorted.length} pending {sorted.length === 1 ? 'tender' : 'tenders'}
          </span>
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expiry">Expiry (urgent)</SelectItem>
            <SelectItem value="rate">Rate (highest)</SelectItem>
            <SelectItem value="posted">Posted (recent)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tender list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sorted.map((tender) => (
            <div
              key={tender.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(tender)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(tender);
                }
              }}
              className="w-full text-left cursor-pointer"
            >
              <TenderCard tender={tender} />
            </div>
          ))}
        </div>
      </div>

      {/* Detail Sheet */}
      <TenderDetailSheet tender={selectedTender} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
