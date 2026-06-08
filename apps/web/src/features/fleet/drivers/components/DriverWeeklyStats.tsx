'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

interface DriverWeeklyStatsProps {
  loadsCompleted?: number;
  milesDriven?: number;
  earningsCents?: number;
  isLoading?: boolean;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-2xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function DriverWeeklyStatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

export function DriverWeeklyStats({
  loadsCompleted = 0,
  milesDriven = 0,
  earningsCents = 0,
  isLoading,
}: DriverWeeklyStatsProps) {
  if (isLoading) return <DriverWeeklyStatsSkeleton />;

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard label="Loads" value={String(loadsCompleted)} />
      <StatCard label="Miles" value={milesDriven.toLocaleString()} />
      <StatCard
        label="Earnings"
        value={`$${(earningsCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
      />
    </div>
  );
}
