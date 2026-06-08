export interface HorizonLoadBlock {
  loadNumber: string;
  referenceNumber: string | null;
  status: string;
  pickupDate: string;
  deliveryDate: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  route: string;
  customerName: string | null;
  requiredEquipmentType: string | null;
}

export interface HorizonUnavailBlock {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  note: string | null;
  createdById: number;
}

export interface HorizonDayData {
  loads: HorizonLoadBlock[];
  driverUnavailability: HorizonUnavailBlock | null;
  vehicleUnavailability: HorizonUnavailBlock | null;
}

export interface HorizonDriverRow {
  driverId: number;
  driverStringId: string;
  name: string;
  initials: string;
  equipmentType: string | null;
  vehicleNumber: string | null;
  vehicleId: number | null;
  vehicleStringId: string | null;
  days: Record<string, HorizonDayData>;
}

export interface SallySuggestion {
  suggestionId: string;
  driverId: number;
  loadNumber: string;
  referenceNumber: string | null;
  route: string;
  matchScore: number;
  date: string;
  reason: string;
}

export interface HorizonStats {
  driversLoaded: number;
  totalDrivers: number;
  openDriverDays: number;
  sallySuggestions: number;
}

export interface HorizonResponse {
  weekStart: string;
  weekEnd: string;
  drivers: HorizonDriverRow[];
  stats: HorizonStats;
  sallyInsight: {
    message: string;
    suggestions: SallySuggestion[];
  } | null;
}
