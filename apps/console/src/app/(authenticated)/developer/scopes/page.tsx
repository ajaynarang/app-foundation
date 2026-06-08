'use client';

import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useDeveloperScopes } from '@/features/developer-scopes/use-scopes';
import { ScopesTable } from '@/features/developer-scopes/components/scopes-table';

function TableSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function DeveloperScopesPage() {
  const { data, isLoading, isError, error } = useDeveloperScopes();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Scopes</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">
          What every scope grants, at a glance. Generated live from the backend scope registry — this list never drifts.
        </p>
      </header>

      {isLoading && <TableSkeleton />}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{(error as Error)?.message ?? 'Failed to load scopes.'}</AlertDescription>
        </Alert>
      )}

      {data && <ScopesTable rows={data} />}
    </div>
  );
}
