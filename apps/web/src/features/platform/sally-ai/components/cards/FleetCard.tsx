'use client';

import type { MockFleet } from '../../engine/types';

export function FleetCard({ data }: { data: Record<string, unknown> }) {
  const fleet = data as unknown as MockFleet;

  const stats = [
    { label: 'Active Vehicles', value: fleet.activeVehicles },
    { label: 'Active Routes', value: fleet.activeRoutes },
    { label: 'Pending Alerts', value: fleet.pendingAlerts },
    { label: 'Driving', value: fleet.driversDriving },
    { label: 'Available', value: fleet.driversAvailable },
    { label: 'Resting', value: fleet.driversResting },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground mb-2">Fleet Overview</p>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center p-1.5 rounded bg-muted">
            <p className="text-lg font-bold text-foreground">{stat.value}</p>
            <p className="text-2xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
