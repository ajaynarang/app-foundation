import { AlertPriority } from '@prisma/client';

export interface AlertTypeDefinition {
  type: string;
  category: string;
  defaultPriority: AlertPriority;
  title: (params: Record<string, any>) => string;
  message: (params: Record<string, any>) => string;
  recommendedAction: (params: Record<string, any>) => string;
  autoResolveCondition?: string;
}

export const ALERT_TYPES: Record<string, AlertTypeDefinition> = {
  // Compliance (6 types)
  HOS_VIOLATION: {
    type: 'HOS_VIOLATION',
    category: 'compliance',
    defaultPriority: AlertPriority.CRITICAL,
    title: (p) => `HOS Violation — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver ${p.driverName || p.driverId} has exceeded ${p.hoursType || 'driving'} hours limit. Current: ${p.currentHours || '?'}h, Limit: ${p.limitHours || '?'}h.`,
    recommendedAction: (p) =>
      `Immediately contact driver to stop driving. Review route ${p.routePlanId || ''} for required rest stop.`,
  },
  HOS_APPROACHING_LIMIT: {
    type: 'HOS_APPROACHING_LIMIT',
    category: 'compliance',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `HOS Approaching Limit — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver has ${p.remainingMinutes || '?'} minutes of ${p.limitType || p.hoursType || 'driving'} time remaining.`,
    recommendedAction: () => `Review remaining stops. Consider inserting rest stop if needed.`,
    autoResolveCondition: 'Driver takes required rest',
  },
  BREAK_REQUIRED: {
    type: 'BREAK_REQUIRED',
    category: 'compliance',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `30-Min Break Required — ${p.driverName || p.driverId}`,
    message: (p) => `Driver must take a 30-minute break within ${p.remainingMinutes || '?'} minutes.`,
    recommendedAction: () => `Identify nearest safe stopping point for break.`,
    autoResolveCondition: 'Driver takes break',
  },
  CYCLE_APPROACHING_LIMIT: {
    type: 'CYCLE_APPROACHING_LIMIT',
    category: 'compliance',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Cycle Limit Approaching — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver approaching ${p.cycleType || '70-hour'} cycle limit. ${p.remainingHours || '?'}h remaining.`,
    recommendedAction: () => `Plan for 34-hour restart if needed within next assignments.`,
    autoResolveCondition: 'Cycle resets',
  },
  RECAP_HOURS_AVAILABLE: {
    type: 'RECAP_HOURS_AVAILABLE',
    category: 'compliance',
    defaultPriority: AlertPriority.LOW,
    title: (p) => `Recap Hours Available — ${p.driverName || p.driverId}`,
    message: (p) => `${p.hoursAvailable || '?'} recap hours became available for driver.`,
    recommendedAction: () => `No action needed. Informational only.`,
  },
  DUTY_STATUS_CHANGE: {
    type: 'DUTY_STATUS_CHANGE',
    category: 'compliance',
    defaultPriority: AlertPriority.LOW,
    title: (p) => `Duty Status Change — ${p.driverName || p.driverId}`,
    message: (p) => `Driver status changed from ${p.fromStatus || '?'} to ${p.toStatus || '?'}.`,
    recommendedAction: () => `Review if status change is expected per route plan.`,
  },

  // Schedule (5 types)
  MISSED_APPOINTMENT: {
    type: 'MISSED_APPOINTMENT',
    category: 'schedule',
    defaultPriority: AlertPriority.CRITICAL,
    title: (p) => `Missed Appointment — ${p.stopName || p.driverId}`,
    message: (p) => `Appointment at ${p.stopName || 'stop'} was missed. Scheduled: ${p.scheduledTime || '?'}.`,
    recommendedAction: (p) => `Contact receiver at ${p.stopName || 'stop'}. Reschedule appointment.`,
  },
  APPOINTMENT_AT_RISK: {
    type: 'APPOINTMENT_AT_RISK',
    category: 'schedule',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Appointment At Risk — ${p.stopName || p.driverId}`,
    message: (p) => `ETA ${p.etaDelay || '?'} minutes late for ${p.stopName || 'next stop'}.`,
    recommendedAction: () => `Evaluate alternate routing or contact receiver to adjust window.`,
    autoResolveCondition: 'ETA recovers within window',
  },
  DOCK_TIME_EXCEEDED: {
    type: 'DOCK_TIME_EXCEEDED',
    category: 'schedule',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Dock Time Exceeded — ${p.stopName || p.driverId}`,
    message: (p) =>
      `Driver has been at dock for ${p.dockMinutes || '?'} min (expected: ${p.expectedMinutes || '?'} min).`,
    recommendedAction: () => `Contact driver or facility to check on loading status.`,
    autoResolveCondition: 'Driver departs dock',
  },
  ROUTE_DELAY: {
    type: 'ROUTE_DELAY',
    category: 'schedule',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Route Delay — ${p.driverName || p.driverId}`,
    message: (p) => `Route delayed by ${p.delayMinutes || '?'} minutes due to ${p.reason || 'unknown cause'}.`,
    recommendedAction: () => `Review route for re-planning options.`,
    autoResolveCondition: 'Delay resolves',
  },
  ROUTE_COMPLETED: {
    type: 'ROUTE_COMPLETED',
    category: 'schedule',
    defaultPriority: AlertPriority.LOW,
    title: (p) => `Route Completed — ${p.driverName || p.driverId}`,
    message: (p) => `Route ${p.routePlanId || ''} completed successfully.`,
    recommendedAction: () => `No action needed.`,
  },

  // Safety (3 types)
  DRIVER_NOT_MOVING: {
    type: 'DRIVER_NOT_MOVING',
    category: 'safety',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Driver Not Moving — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver has been stationary for ${p.stationaryMinutes || '?'} minutes at ${p.location || 'unknown location'}.`,
    recommendedAction: () => `Contact driver to check status. May indicate breakdown or rest.`,
    autoResolveCondition: 'Driver resumes movement',
  },
  SPEEDING: {
    type: 'SPEEDING',
    category: 'safety',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Speeding — ${p.driverName || p.driverId}`,
    message: (p) => `Driver traveling at ${p.speed || '?'} mph in ${p.speedLimit || '?'} mph zone.`,
    recommendedAction: () => `Contact driver if speed continues above threshold.`,
    autoResolveCondition: 'Speed returns to normal',
  },
  UNAUTHORIZED_STOP: {
    type: 'UNAUTHORIZED_STOP',
    category: 'safety',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Unauthorized Stop — ${p.driverName || p.driverId}`,
    message: (p) => `Driver stopped at unplanned location: ${p.location || 'unknown'}.`,
    recommendedAction: () => `Contact driver to verify reason for stop.`,
    autoResolveCondition: 'Driver departs',
  },

  // Route (2 types — external conditions)
  FUEL_LOW: {
    type: 'FUEL_LOW',
    category: 'route',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Fuel Low — ${p.vehicleId || p.driverId}`,
    message: (p) => `Fuel level at ${p.fuelPercent || '?'}%. Estimated range: ${p.rangeEstimateMiles || '?'} miles.`,
    recommendedAction: () => `Route includes fuel stop. Verify driver plans to refuel.`,
    autoResolveCondition: 'Fuel level increases',
  },
  WEATHER_ALERT: {
    type: 'WEATHER_ALERT',
    category: 'route',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Weather Alert — ${p.area || p.driverId}`,
    message: (p) => `${p.weatherType || 'Severe weather'} reported on route: ${p.description || 'Check conditions'}.`,
    recommendedAction: () => `Monitor conditions. Consider alternate routing if severe.`,
    autoResolveCondition: 'Weather clears',
  },
  ROAD_CLOSURE: {
    type: 'ROAD_CLOSURE',
    category: 'route',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Road Closure — ${p.road || p.driverId}`,
    message: (p) => `${p.road || 'Road'} is closed: ${p.reason || 'Check for details'}. Detour may be needed.`,
    recommendedAction: () => `Re-plan route to avoid closure.`,
    autoResolveCondition: 'Road reopens',
  },

  OFF_PACE: {
    type: 'OFF_PACE',
    category: 'schedule',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Off-Pace — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver behind pace for ${p.stopName || 'next stop'}. ETA: ${p.estimatedDriveMinutes || '?'} min, deadline: ${p.minutesUntilDeadline || '?'} min.`,
    recommendedAction: () => `Review route. Consider contacting driver or adjusting appointment.`,
    autoResolveCondition: 'Pace recovers',
  },
  NO_PICKUP_ACTIVITY: {
    type: 'NO_PICKUP_ACTIVITY',
    category: 'schedule',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `No Pickup Activity — ${p.driverName || p.driverId}`,
    message: (p) => `Load ${p.loadId || '?'} assigned ${p.hoursSinceAssignment || '?'}h ago with no pickup activity.`,
    recommendedAction: () => `Contact driver to confirm pickup status. Consider reassignment if unresponsive.`,
    autoResolveCondition: 'Load transitions to in_transit',
  },

  // Schedule — lifecycle
  UNCONFIRMED_PICKUP: {
    type: 'UNCONFIRMED_PICKUP',
    category: 'schedule',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Unconfirmed Pickup — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver departed ${p.stopName || 'dock'} without confirming pickup. Load may be on truck without confirmation.`,
    recommendedAction: (p) =>
      `Contact driver to confirm pickup, or confirm on their behalf for ${p.stopName || 'this stop'}.`,
  },
  UNCONFIRMED_DELIVERY: {
    type: 'UNCONFIRMED_DELIVERY',
    category: 'schedule',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Unconfirmed Delivery — ${p.driverName || p.driverId}`,
    message: (p) => `Driver departed ${p.stopName || 'dock'} without confirming delivery. Load status not updated.`,
    recommendedAction: (p) =>
      `Contact driver to confirm delivery, or confirm on their behalf for ${p.stopName || 'this stop'}.`,
  },

  // Route Plan — plan-aware monitoring
  PLAN_BEHIND_SCHEDULE: {
    type: 'PLAN_BEHIND_SCHEDULE',
    category: 'schedule',
    defaultPriority: AlertPriority.MEDIUM,
    title: (p) => `Plan Behind Schedule — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Route plan is ${p.delayMinutes || '?'} minutes behind schedule at ${p.segmentType || 'segment'} segment.`,
    recommendedAction: () => `Review route plan. Consider re-planning or notifying receiver of delay.`,
    autoResolveCondition: 'Schedule recovers',
  },
  PLAN_MISSED_STOP: {
    type: 'PLAN_MISSED_STOP',
    category: 'schedule',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Missed Planned Stop — ${p.driverName || p.driverId}`,
    message: (p) =>
      `Driver bypassed planned ${p.segmentType || 'stop'} at ${p.stopLocation || 'unknown'}. ${p.distancePastMiles || '?'} miles past.`,
    recommendedAction: (p) =>
      `Contact driver about missed ${p.segmentType || 'stop'}. Re-plan route if ${p.segmentType === 'fuel' ? 'fuel stop' : 'rest stop'} is still needed.`,
  },
  PLAN_SEGMENT_STALLED: {
    type: 'PLAN_SEGMENT_STALLED',
    category: 'schedule',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Segment Stalled — ${p.driverName || p.driverId}`,
    message: (p) =>
      `${p.segmentType || 'Segment'} from ${p.fromLocation || '?'} to ${p.toLocation || '?'} has taken ${p.elapsedMinutes || '?'} min (expected: ${p.expectedMinutes || '?'} min).`,
    recommendedAction: () => `Contact driver to check status. May indicate breakdown, traffic, or other delay.`,
    autoResolveCondition: 'Segment completes',
  },

  // Operations — Driver Actions
  LUMPER_REQUEST: {
    type: 'LUMPER_REQUEST',
    category: 'operations',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Lumper Funds Requested — $${((p.requestedCents ?? 0) / 100).toFixed(2)}`,
    message: (p) =>
      `${p.driverName ?? 'Driver'} is requesting lumper funds for Load ${p.loadId ?? ''}. Method: ${(p.method ?? '').toUpperCase()}.`,
    recommendedAction: () => `Review and approve the lumper request. Enter money code and send to driver.`,
  },
  DETENTION_REPORT: {
    type: 'DETENTION_REPORT',
    category: 'operations',
    defaultPriority: AlertPriority.HIGH,
    title: (p) => `Detention Reported — ${p.driverName ?? 'Driver'}`,
    message: (p) =>
      `${p.driverName ?? 'Driver'} is reporting detention at a stop on Load ${p.loadId ?? ''}.${p.note ? ` Note: ${p.note}` : ''}`,
    recommendedAction: () => `Review dock time and add detention charge if applicable.`,
  },
  ISSUE_REPORT: {
    type: 'ISSUE_REPORT',
    category: 'safety',
    defaultPriority: AlertPriority.CRITICAL,
    title: (p) => `Issue Reported — ${p.driverName ?? 'Driver'}`,
    message: (p) =>
      `${p.driverName ?? 'Driver'} has reported an issue on Load ${p.loadId ?? ''}.${p.note ? ` ${p.note}` : ''}`,
    recommendedAction: () => `Contact driver immediately and assess the situation.`,
  },
};
