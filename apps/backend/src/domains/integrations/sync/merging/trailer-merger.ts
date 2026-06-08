import { Injectable } from '@nestjs/common';
import { ELDTrailerData } from '../../adapters/eld/eld-adapter.interface';

interface TmsTrailerData {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  licensePlate?: string | null;
}

interface MergedTrailerData {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  eldTelematicsMetadata: {
    eldVendor: string;
    eldId: string;
    lastSyncAt: string;
  };
}

@Injectable()
export class TrailerMerger {
  /**
   * Merge TMS and ELD trailer data with priority rules:
   * - TMS wins: operational data (vin, make, model, year, licensePlate)
   * - ELD fills gaps when TMS data is missing
   * - ELD always provides telematics metadata
   */
  merge(tmsData: TmsTrailerData = {}, eldData: ELDTrailerData, vendor = 'samsara'): MergedTrailerData {
    return {
      vin: tmsData.vin || eldData.serialNumber || undefined,
      make: tmsData.make || eldData.make || undefined,
      model: tmsData.model || eldData.model || undefined,
      year: tmsData.year || (eldData.year ? Number(eldData.year) : undefined),
      licensePlate: tmsData.licensePlate || eldData.licensePlate || undefined,
      eldTelematicsMetadata: {
        eldVendor: vendor,
        eldId: eldData.id,
        lastSyncAt: new Date().toISOString(),
      },
    };
  }
}
