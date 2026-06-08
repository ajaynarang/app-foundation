export interface DevUser {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  driverId?: string | null;
  phone?: string | null;
}

export interface AuthState {
  tenantId: string;
  tenantName: string;
  tokens: Record<string, string>;
  users: Record<string, DevUser>;
  availableRoles: string[];
  missingRoles: string[];
  baseUrl: string;
}
