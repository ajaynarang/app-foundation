import { Injectable, Logger } from '@nestjs/common';
import {
  IftaAnomalyType,
  IftaAnomaly,
  IftaStateCalculation,
  NO_FUEL_MILEAGE_THRESHOLD,
  MPG_RANGE,
  DEADLINE_WARNING_DAYS,
  DEADLINE_CRITICAL_DAYS,
} from '../ifta.types';

export interface AnomalyDetectionInput {
  stateBreakdown: IftaStateCalculation[];
  totalMiles: number;
  totalGallons: number;
  fleetAvgMpg: number;
  filingDeadline: Date;
  currentDate: Date;
}

@Injectable()
export class IftaAnomalyDetectorService {
  private readonly logger = new Logger(IftaAnomalyDetectorService.name);

  /**
   * Detects anomalies in IFTA quarter data.
   * Returns an array of anomalies sorted by severity.
   */
  detectAnomalies(input: AnomalyDetectionInput): IftaAnomaly[] {
    const anomalies: IftaAnomaly[] = [];

    // Rule 1: NO_FUEL_IN_HIGH_MILEAGE_STATE
    for (const state of input.stateBreakdown) {
      if (state.totalMiles >= NO_FUEL_MILEAGE_THRESHOLD && state.fuelPurchasedGallons === 0) {
        anomalies.push({
          type: IftaAnomalyType.NO_FUEL_IN_HIGH_MILEAGE_STATE,
          severity: 'WARNING',
          title: `No fuel purchases in ${state.jurisdictionName}`,
          description: `${state.jurisdictionName} (${state.jurisdiction}) has ${Math.round(state.totalMiles)} miles but no recorded fuel purchases. This may trigger an audit flag.`,
          jurisdiction: state.jurisdiction,
          recommendation: 'Verify fuel purchase records for this state. Add missing receipts or fuel card data.',
        });
      }
    }

    // Rule 2: FUEL_WITHOUT_MILEAGE
    for (const state of input.stateBreakdown) {
      if (state.fuelPurchasedGallons > 0 && state.totalMiles === 0) {
        anomalies.push({
          type: IftaAnomalyType.FUEL_WITHOUT_MILEAGE,
          severity: 'INFO',
          title: `Fuel purchased in ${state.jurisdictionName} but no mileage`,
          description: `${state.jurisdictionName} (${state.jurisdiction}) has ${state.fuelPurchasedGallons.toFixed(1)} gallons purchased but 0 miles recorded.`,
          jurisdiction: state.jurisdiction,
          recommendation: 'Check if loads were driven in this state. The fuel may have been purchased near a border.',
        });
      }
    }

    // Rule 3: UNUSUALLY_HIGH_MPG
    if (input.totalGallons > 0 && input.totalMiles > 0) {
      const effectiveMpg = input.totalMiles / input.totalGallons;
      if (effectiveMpg > MPG_RANGE.max) {
        anomalies.push({
          type: IftaAnomalyType.UNUSUALLY_HIGH_MPG,
          severity: 'WARNING',
          title: 'Fleet MPG unusually high',
          description: `Effective fleet MPG is ${effectiveMpg.toFixed(1)}, which exceeds the typical maximum of ${MPG_RANGE.max}. This may indicate missing fuel records.`,
          recommendation:
            'Review fuel purchase records for completeness. Ensure all fuel card transactions are imported.',
        });
      }

      // Rule 4: UNUSUALLY_LOW_MPG
      if (effectiveMpg < MPG_RANGE.min) {
        anomalies.push({
          type: IftaAnomalyType.UNUSUALLY_LOW_MPG,
          severity: 'INFO',
          title: 'Fleet MPG unusually low',
          description: `Effective fleet MPG is ${effectiveMpg.toFixed(1)}, which is below the typical minimum of ${MPG_RANGE.min}. This may indicate missing mileage data or duplicate fuel entries.`,
          recommendation: 'Verify mileage data is complete and check for duplicate fuel purchases.',
        });
      }
    }

    // Rule 5: MISSING_MILEAGE_DATA
    if (input.totalMiles === 0 && input.totalGallons > 0) {
      anomalies.push({
        type: IftaAnomalyType.MISSING_MILEAGE_DATA,
        severity: 'CRITICAL',
        title: 'No mileage data recorded',
        description: `Total mileage is 0 but ${input.totalGallons.toFixed(1)} gallons of fuel were purchased. IFTA filing cannot be completed without mileage data.`,
        recommendation: 'Add manual mileage entries or ensure loads have origin/destination states and mileage data.',
      });
    }

    // Deadline rules
    const diffMs = input.filingDeadline.getTime() - input.currentDate.getTime();
    const daysUntilDeadline = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Rule 7: QUARTER_DEADLINE_OVERDUE (check first — takes priority)
    if (daysUntilDeadline < 0) {
      anomalies.push({
        type: IftaAnomalyType.QUARTER_DEADLINE_OVERDUE,
        severity: 'CRITICAL',
        title: 'Filing deadline has passed',
        description: `The IFTA filing deadline was ${Math.abs(daysUntilDeadline)} day(s) ago. Late filings may incur penalties.`,
        recommendation: 'File the IFTA return immediately to minimize late penalties and interest.',
      });
    }
    // Rule 6: QUARTER_DEADLINE_APPROACHING
    else if (daysUntilDeadline <= DEADLINE_CRITICAL_DAYS) {
      anomalies.push({
        type: IftaAnomalyType.QUARTER_DEADLINE_APPROACHING,
        severity: 'CRITICAL',
        title: 'Filing deadline is imminent',
        description: `Only ${daysUntilDeadline} day(s) until the IFTA filing deadline.`,
        recommendation: 'Complete calculations and file the IFTA return as soon as possible.',
      });
    } else if (daysUntilDeadline <= DEADLINE_WARNING_DAYS) {
      anomalies.push({
        type: IftaAnomalyType.QUARTER_DEADLINE_APPROACHING,
        severity: 'WARNING',
        title: 'Filing deadline approaching',
        description: `${daysUntilDeadline} days until the IFTA filing deadline.`,
        recommendation: 'Begin reviewing mileage and fuel data to prepare for filing.',
      });
    }

    return anomalies;
  }
}
