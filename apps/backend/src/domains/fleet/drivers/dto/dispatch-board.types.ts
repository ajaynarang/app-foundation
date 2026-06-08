export type DispatchDriverStatus = 'available' | 'onLoad' | 'unavailable';

export interface DispatchBoardDriverDto {
  driverId: string;
  name: string;
  phone: string | null;
  status: DispatchDriverStatus;
  unavailability: {
    type: string;
    startDate: string;
    endDate: string;
  } | null;
  vehicle: {
    unitNumber: string;
    equipmentType: string;
  } | null;
  currentLoad: {
    loadNumber: string;
    customerName: string;
    status: string;
    origin: string;
    destination: string;
  } | null;
  queuedLoadCount: number;
  hos: {
    driveRemainingHours: number | null;
    dutyRemainingHours: number | null;
    cycleRemainingHours: number | null;
    breakRemainingHours: number | null;
    isCritical: boolean;
    dataAgeMinutes: number | null;
  } | null;
  location: {
    city: string;
    state: string;
  } | null;
}

export interface DispatchBoardSummaryDto {
  total: number;
  onLoad: number;
  available: number;
  unavailable: number;
  hosCritical: number;
}

export interface DispatchBoardResponseDto {
  drivers: DispatchBoardDriverDto[];
  summary: DispatchBoardSummaryDto;
}
