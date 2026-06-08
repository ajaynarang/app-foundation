'use client';

import { LogOut } from 'lucide-react';
import { cn } from '@sally/ui';
import { formatPhone } from '@/shared/lib/utils/phone';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAuthStore } from '@/features/auth';
import type { Driver } from '../types';

interface DriverProfileCardProps {
  driver?: Driver;
  isLoading?: boolean;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function DriverProfileSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DriverProfileCard({ driver, isLoading }: DriverProfileCardProps) {
  const { signOut } = useAuthStore();

  if (isLoading) return <DriverProfileSkeleton />;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-semibold">
            {getInitials(driver?.name)}
          </div>
          <div>
            <p className="font-semibold text-foreground">{driver?.name || 'Driver'}</p>
            <p className="text-xs text-muted-foreground">{driver?.cdlClass ? `CDL ${driver.cdlClass}` : 'Driver'}</p>
            {/* Duty status */}
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  driver?.currentLoad ? 'bg-accent' : 'bg-muted-foreground',
                )}
              />
              {driver?.currentLoad ? 'On load' : 'Available'}
            </p>
          </div>
        </div>

        {/* Info grid */}
        <div className="space-y-2 text-sm">
          {driver?.phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="text-foreground">{formatPhone(driver.phone)}</span>
            </div>
          )}
          {driver?.email && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground truncate ml-4">{driver.email}</span>
            </div>
          )}
          {driver?.licenseNumber && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">License</span>
              <span className="text-foreground">{driver.licenseNumber}</span>
            </div>
          )}
          {driver?.homeTerminalCity && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Home Terminal</span>
              <span className="text-foreground">
                {driver.homeTerminalCity}, {driver.homeTerminalState}
              </span>
            </div>
          )}
        </div>

        {/* Sign out */}
        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          <LogOut className="mr-1.5 h-4 w-4" />
          Sign Out
        </Button>
      </CardContent>
    </Card>
  );
}
