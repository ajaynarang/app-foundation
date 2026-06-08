/** DAT Power API response types */

export interface DATAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface DATLocation {
  city: string;
  state: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface DATMatch {
  matchId: string;
  origin: DATLocation;
  destination: DATLocation;
  rate: { rateDollars: number; ratePerMileDollars: number };
  distance: { miles: number };
  deadheadMiles?: number;
  equipment: { type: string };
  weight?: { pounds: number };
  commodity?: string;
  pickupDate: string;
  deliveryDate?: string;
  broker: {
    name: string;
    phone?: string;
    email?: string;
    mcNumber?: string;
    contact?: string;
  };
  specialInstructions?: string;
  referenceNumber?: string;
  postedAt: string;
  length?: number;
}

export interface DATSearchResponse {
  matches: DATMatch[];
  totalCount: number;
}
