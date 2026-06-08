import { User, Clock, MapPin, Package, type LucideIcon } from 'lucide-react';
import type { Alert } from '../types';

export interface QuickAction {
  label: string;
  icon: LucideIcon;
  href: (alert: Alert) => string;
}

export const ALERT_QUICK_ACTIONS: Record<string, QuickAction[]> = {
  HOS_VIOLATION: [
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
    { label: 'View HOS', icon: Clock, href: (a) => `/dispatcher/fleet?driver=${a.driverId}&tab=hos` },
  ],
  HOS_APPROACHING_LIMIT: [
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
    { label: 'View HOS', icon: Clock, href: (a) => `/dispatcher/fleet?driver=${a.driverId}&tab=hos` },
  ],
  BREAK_REQUIRED: [{ label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` }],
  CYCLE_APPROACHING_LIMIT: [
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
  ],
  FUEL_LOW: [
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
    { label: 'View Map', icon: MapPin, href: (a) => `/dispatcher/fleet?driver=${a.driverId}&tab=map` },
  ],
  DRIVER_NOT_MOVING: [
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
    { label: 'View Map', icon: MapPin, href: (a) => `/dispatcher/fleet?driver=${a.driverId}&tab=map` },
  ],
  APPOINTMENT_AT_RISK: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` }],
  MISSED_APPOINTMENT: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` }],
  DOCK_TIME_EXCEEDED: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` }],
  OFF_PACE: [
    { label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` },
    { label: 'View Map', icon: MapPin, href: (a) => `/dispatcher/fleet?driver=${a.driverId}&tab=map` },
  ],
  NO_PICKUP_ACTIVITY: [
    { label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` },
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
  ],
  UNCONFIRMED_PICKUP: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` }],
  UNCONFIRMED_DELIVERY: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads/${a.loadId}` }],
  LUMPER_REQUEST: [{ label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads?load=${a.loadId}` }],
  DETENTION_REPORT: [
    { label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads?load=${a.loadId}` },
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
  ],
  ISSUE_REPORT: [
    { label: 'View Load', icon: Package, href: (a) => `/dispatcher/loads?load=${a.loadId}` },
    { label: 'View Driver', icon: User, href: (a) => `/dispatcher/fleet?driver=${a.driverId}` },
  ],
};
