import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type SallyCapabilities, type SallyUserMode, SallyUserModeSchema } from '@sally/shared-types';
import { getCapabilitiesForMode } from './capability-registry.data';

const DEFAULT_MODE: SallyUserMode = 'dispatcher';
const UNAUTH_MODE: SallyUserMode = 'prospect';

const ROLE_TO_MODE: Record<UserRole, SallyUserMode> = {
  [UserRole.DRIVER]: 'driver',
  [UserRole.DISPATCHER]: 'dispatcher',
  [UserRole.ADMIN]: 'admin',
  [UserRole.OWNER]: 'owner',
  [UserRole.SUPER_ADMIN]: 'super_admin',
  [UserRole.CUSTOMER]: 'customer',
};

@Injectable()
export class CapabilityRegistryService {
  /**
   * Resolve the capability set for the requesting user. Precedence:
   * 1. Explicit `mode` query param (lets the home/marketing surface ask
   *    for the prospect set even when authenticated).
   * 2. JWT role mapped to mode.
   * 3. Unauthenticated → prospect.
   */
  resolve(opts: { requestedMode?: string; userRole?: UserRole }): SallyCapabilities {
    const mode = this.pickMode(opts);
    return getCapabilitiesForMode(mode);
  }

  private pickMode({ requestedMode, userRole }: { requestedMode?: string; userRole?: UserRole }): SallyUserMode {
    if (requestedMode) {
      const parsed = SallyUserModeSchema.safeParse(requestedMode);
      if (parsed.success) return parsed.data;
    }
    if (userRole) {
      return ROLE_TO_MODE[userRole] ?? DEFAULT_MODE;
    }
    return UNAUTH_MODE;
  }
}
