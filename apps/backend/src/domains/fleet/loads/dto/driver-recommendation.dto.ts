export class DriverRecommendationDto {
  driverId: string;
  name: string;
  initials: string;
  matchScore: number;
  matchRationale: string;
  isBestMatch: boolean;
  equipmentMatch: boolean;
  equipmentType: string | null;
  hos: {
    driveHoursRemaining: number;
    shiftHoursRemaining: number;
    cycleHoursRemaining: number;
    breakHoursRemaining: number;
    nextResetAt: string | null;
  };
  proximity: {
    distanceMilesFromPickup: number;
    lastKnownLocation: string;
  };
  availability: {
    status: 'available' | 'on_load' | 'resting';
    currentLoadNumber: string | null;
    currentLoadEta: string | null;
    availableAt: string;
  };
  vehicle: {
    vehicleId: string;
    unitNumber: string;
    equipmentType: string;
  } | null;
  activeLoadCount: number;
}

export class DriverRecommendationsResponseDto {
  recommendations: DriverRecommendationDto[];
}
