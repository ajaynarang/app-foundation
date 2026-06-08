'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { useCreateSavedSearch } from '../hooks/use-saved-searches';
import type { LoadBoardSearchParams } from '../types';

interface SaveSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchParams: LoadBoardSearchParams;
}

export function SaveSearchDialog({ open, onOpenChange, searchParams }: SaveSearchDialogProps) {
  const [name, setName] = useState('');
  const [minRate, setMinRate] = useState('');
  const createSavedSearch = useCreateSavedSearch();

  const defaultName = `${searchParams.origin.city}, ${searchParams.origin.state}${
    searchParams.destination ? ` → ${searchParams.destination.city}, ${searchParams.destination.state}` : ''
  }`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSavedSearch.mutate(
      {
        name: name.trim() || defaultName,
        searchParams,
        minRate:
          minRate && !isNaN(parseFloat(minRate)) && parseFloat(minRate) > 0 && parseFloat(minRate) <= 100
            ? parseFloat(minRate)
            : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName('');
          setMinRate('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save this search</DialogTitle>
          <DialogDescription>Get notified when new loads match this lane.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-name">Name</Label>
            <Input
              id="search-name"
              placeholder={defaultName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="min-rate">Minimum rate ($/mi)</Label>
            <Input
              id="min-rate"
              type="number"
              placeholder="e.g. 2.50"
              value={minRate}
              onChange={(e) => setMinRate(e.target.value)}
              min={0}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">Only alert when loads pay at least this rate per mile.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createSavedSearch.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
