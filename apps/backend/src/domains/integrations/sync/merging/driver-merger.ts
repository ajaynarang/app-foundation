import { Injectable } from '@nestjs/common';

interface TmsDriverData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  licenseState?: string;
  status?: string;
}

interface EldDriverData {
  eldVendor?: string;
  eldId?: string;
  name?: string;
  username?: string;
  phone?: string;
  licenseNumber?: string;
  licenseState?: string;
  eldSettings?: any;
  carrierSettings?: object;
  tags?: Array<{ id: string; name: string }>;
  timezone?: string;
  driverActivationStatus?: string;
}

interface MergedDriverData extends TmsDriverData {
  eldMetadata?: any;
}

@Injectable()
export class DriverMerger {
  /**
   * Merge TMS and ELD driver data with priority rules:
   * - TMS wins: operational data (name, phone, license, status)
   * - ELD wins: HOS data (eldSettings, timezone)
   * - Admin wins: activation status (override both TMS and ELD)
   * - ELD fills gaps when TMS data is missing
   */
  merge(tmsData: TmsDriverData = {}, eldData: EldDriverData = {}): MergedDriverData {
    const merged: MergedDriverData = {
      // Operational data: TMS wins, ELD fills gaps
      firstName: tmsData.firstName,
      lastName: tmsData.lastName,
      phone: tmsData.phone || eldData.phone,
      email: tmsData.email,
      licenseNumber: tmsData.licenseNumber || eldData.licenseNumber,
      licenseState: tmsData.licenseState || eldData.licenseState,
      status: tmsData.status, // Admin/TMS always wins on status
    };

    // Package ELD HOS data into JSONB
    if (eldData.eldId) {
      merged.eldMetadata = {
        eldVendor: eldData.eldVendor,
        eldId: eldData.eldId,
        username: eldData.username,
        eldSettings: eldData.eldSettings,
        carrierSettings: eldData.carrierSettings || null,
        tags: eldData.tags || null,
        timezone: eldData.timezone,
        lastSyncAt: new Date().toISOString(),
      };
    }

    return merged;
  }
}
