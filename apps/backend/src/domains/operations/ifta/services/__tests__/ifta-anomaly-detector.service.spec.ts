import { IftaAnomalyDetectorService, AnomalyDetectionInput } from '../ifta-anomaly-detector.service';
import { IftaAnomalyType, IftaStateCalculation } from '../../ifta.types';

describe('IftaAnomalyDetectorService', () => {
  let service: IftaAnomalyDetectorService;

  beforeEach(() => {
    service = new IftaAnomalyDetectorService();
  });

  function makeState(overrides: Partial<IftaStateCalculation> = {}): IftaStateCalculation {
    return {
      jurisdiction: 'TX',
      jurisdictionName: 'Texas',
      totalMiles: 1000,
      taxableGallons: 153.85,
      fuelPurchasedGallons: 100,
      taxRate: 0.2,
      surchargeRate: 0,
      taxOwedCents: 3077,
      surchargeOwedCents: 0,
      taxPaidCents: 2000,
      netTaxCents: 1077,
      ...overrides,
    };
  }

  function makeInput(overrides: Partial<AnomalyDetectionInput> = {}): AnomalyDetectionInput {
    return {
      stateBreakdown: [makeState()],
      totalMiles: 1000,
      totalGallons: 100,
      fleetAvgMpg: 6.5,
      filingDeadline: new Date('2026-07-31'),
      currentDate: new Date('2026-06-01'),
      ...overrides,
    };
  }

  describe('NO_FUEL_IN_HIGH_MILEAGE_STATE', () => {
    it('should flag states with >= 500 miles and 0 fuel', () => {
      const input = makeInput({
        stateBreakdown: [
          makeState({
            jurisdiction: 'TX',
            totalMiles: 600,
            fuelPurchasedGallons: 0,
          }),
        ],
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.NO_FUEL_IN_HIGH_MILEAGE_STATE);
      expect(match).toBeDefined();
      expect(match.severity).toBe('WARNING');
    });

    it('should NOT flag states with < 500 miles and 0 fuel', () => {
      const input = makeInput({
        stateBreakdown: [makeState({ totalMiles: 400, fuelPurchasedGallons: 0 })],
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.NO_FUEL_IN_HIGH_MILEAGE_STATE);
      expect(match).toBeUndefined();
    });
  });

  describe('FUEL_WITHOUT_MILEAGE', () => {
    it('should flag states with fuel but 0 miles', () => {
      const input = makeInput({
        stateBreakdown: [
          makeState({
            jurisdiction: 'NM',
            jurisdictionName: 'New Mexico',
            totalMiles: 0,
            fuelPurchasedGallons: 50,
          }),
        ],
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.FUEL_WITHOUT_MILEAGE);
      expect(match).toBeDefined();
      expect(match.severity).toBe('INFO');
    });
  });

  describe('UNUSUALLY_HIGH_MPG', () => {
    it('should flag when MPG > 9.0', () => {
      const input = makeInput({
        totalMiles: 10000,
        totalGallons: 1000,
        // effective MPG = 10.0
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.UNUSUALLY_HIGH_MPG);
      expect(match).toBeDefined();
      expect(match.severity).toBe('WARNING');
    });
  });

  describe('UNUSUALLY_LOW_MPG', () => {
    it('should flag when MPG < 4.0', () => {
      const input = makeInput({
        totalMiles: 3000,
        totalGallons: 1000,
        // effective MPG = 3.0
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.UNUSUALLY_LOW_MPG);
      expect(match).toBeDefined();
      expect(match.severity).toBe('INFO');
    });
  });

  describe('MISSING_MILEAGE_DATA', () => {
    it('should flag when totalMiles=0 but totalGallons>0', () => {
      const input = makeInput({
        totalMiles: 0,
        totalGallons: 500,
        stateBreakdown: [],
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.MISSING_MILEAGE_DATA);
      expect(match).toBeDefined();
      expect(match.severity).toBe('CRITICAL');
    });
  });

  describe('QUARTER_DEADLINE_APPROACHING', () => {
    it('should return CRITICAL when <= 7 days', () => {
      const input = makeInput({
        filingDeadline: new Date('2026-06-07'),
        currentDate: new Date('2026-06-03'),
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.QUARTER_DEADLINE_APPROACHING);
      expect(match).toBeDefined();
      expect(match.severity).toBe('CRITICAL');
    });

    it('should return WARNING when <= 30 days but > 7 days', () => {
      const input = makeInput({
        filingDeadline: new Date('2026-06-25'),
        currentDate: new Date('2026-06-03'),
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.QUARTER_DEADLINE_APPROACHING);
      expect(match).toBeDefined();
      expect(match.severity).toBe('WARNING');
    });
  });

  describe('QUARTER_DEADLINE_OVERDUE', () => {
    it('should flag when deadline has passed', () => {
      const input = makeInput({
        filingDeadline: new Date('2026-04-30'),
        currentDate: new Date('2026-05-05'),
      });

      const anomalies = service.detectAnomalies(input);
      const match = anomalies.find((a) => a.type === IftaAnomalyType.QUARTER_DEADLINE_OVERDUE);
      expect(match).toBeDefined();
      expect(match.severity).toBe('CRITICAL');
    });
  });

  it('should return no anomalies for clean data with distant deadline', () => {
    const input = makeInput({
      stateBreakdown: [makeState()],
      totalMiles: 1000,
      totalGallons: 154,
      filingDeadline: new Date('2026-10-31'),
      currentDate: new Date('2026-06-01'),
    });

    const anomalies = service.detectAnomalies(input);
    expect(anomalies).toHaveLength(0);
  });
});
