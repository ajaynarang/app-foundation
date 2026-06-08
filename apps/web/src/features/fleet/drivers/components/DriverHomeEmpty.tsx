'use client';

import { Truck } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { HOSCompactClocks } from './HOSCompactClocks';

interface DriverHomeEmptyProps {
  driveRemaining?: number;
  shiftRemaining?: number;
  cycleRemaining?: number;
  breakRemaining?: number;
}

export function DriverHomeEmpty({
  driveRemaining = 0,
  shiftRemaining = 0,
  cycleRemaining = 0,
  breakRemaining = 0,
}: DriverHomeEmptyProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Truck className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">No Active Load</h3>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have a load assigned right now. Your dispatcher will assign one when it&apos;s ready.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">HOS Available</h4>
          <HOSCompactClocks
            driveRemaining={driveRemaining}
            shiftRemaining={shiftRemaining}
            cycleRemaining={cycleRemaining}
            breakRemaining={breakRemaining}
          />
        </CardContent>
      </Card>
    </div>
  );
}
