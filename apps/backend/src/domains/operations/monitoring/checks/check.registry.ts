import { Injectable } from '@nestjs/common';
import { MonitoringCheck, CheckCategory, CheckScope } from '../monitoring.types';
import { DriveLimitCheck } from './hos/drive-limit.check';
import { DutyLimitCheck } from './hos/duty-limit.check';
import { BreakRequiredCheck } from './hos/break-required.check';
import { CycleLimitCheck } from './hos/cycle-limit.check';
import { HosViolationCheck } from './hos/hos-violation.check';
import { AppointmentAtRiskCheck } from './load-progress/appointment-at-risk.check';
import { MissedAppointmentCheck } from './load-progress/missed-appointment.check';
import { DockTimeExceededCheck } from './load-progress/dock-time-exceeded.check';
import { OffPaceCheck } from './load-progress/off-pace.check';
import { DriverNotMovingCheck } from './driver-behavior/driver-not-moving.check';
import { FuelLowCheck } from './vehicle-state/fuel-low.check';
import { UnconfirmedPickupCheck } from './lifecycle/unconfirmed-pickup.check';
import { UnconfirmedDeliveryCheck } from './lifecycle/unconfirmed-delivery.check';
import { NoPickupActivityCheck } from './lifecycle/no-pickup-activity.check';
import { PlanBehindScheduleCheck } from './load-progress/plan-behind-schedule.check';
import { PlanMissedStopCheck } from './load-progress/plan-missed-stop.check';
import { PlanSegmentStalledCheck } from './load-progress/plan-segment-stalled.check';

@Injectable()
export class CheckRegistry {
  private checks: Map<string, MonitoringCheck>;

  constructor() {
    const allChecks: MonitoringCheck[] = [
      new DriveLimitCheck(),
      new DutyLimitCheck(),
      new BreakRequiredCheck(),
      new CycleLimitCheck(),
      new HosViolationCheck(),
      new AppointmentAtRiskCheck(),
      new MissedAppointmentCheck(),
      new DockTimeExceededCheck(),
      new OffPaceCheck(),
      new DriverNotMovingCheck(),
      new FuelLowCheck(),
      new UnconfirmedPickupCheck(),
      new UnconfirmedDeliveryCheck(),
      new NoPickupActivityCheck(),
      new PlanBehindScheduleCheck(),
      new PlanMissedStopCheck(),
      new PlanSegmentStalledCheck(),
    ];
    this.checks = new Map(allChecks.map((c) => [c.id, c]));
  }

  getAll(): MonitoringCheck[] {
    return Array.from(this.checks.values());
  }

  getById(id: string): MonitoringCheck | undefined {
    return this.checks.get(id);
  }

  getByCategory(category: CheckCategory): MonitoringCheck[] {
    return this.getAll().filter((c) => c.category === category);
  }

  getByScope(scope: CheckScope): MonitoringCheck[] {
    return this.getAll().filter((c) => c.scope === scope);
  }

  resolveChecks(availableCapabilities: Set<string>): {
    active: MonitoringCheck[];
    inactive: {
      id: string;
      displayName: string;
      category: CheckCategory;
      reason: string;
    }[];
  } {
    const active: MonitoringCheck[] = [];
    const inactive: {
      id: string;
      displayName: string;
      category: CheckCategory;
      reason: string;
    }[] = [];

    for (const check of this.getAll()) {
      const missingDeps = check.needs.filter((n) => !availableCapabilities.has(n));
      if (missingDeps.length === 0) {
        active.push(check);
      } else {
        inactive.push({
          id: check.id,
          displayName: check.displayName,
          category: check.category,
          reason: `Requires: ${missingDeps.join(', ')}`,
        });
      }
    }

    return { active, inactive };
  }
}
