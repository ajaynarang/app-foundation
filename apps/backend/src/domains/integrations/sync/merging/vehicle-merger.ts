import { Injectable } from '@nestjs/common';

interface TmsVehicleData {
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  licensePlate?: string;
  status?: string;
  capacity?: number;
}

interface EldVehicleData {
  eldVendor?: string;
  eldId?: string;
  serial?: string;
  gateway?: { serial?: string; model?: string };
  esn?: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  licensePlate?: string;
  cameraSerial?: string;
}

interface MergedVehicleData extends TmsVehicleData {
  eldTelematicsMetadata?: any;
}

@Injectable()
export class VehicleMerger {
  /**
   * Merge TMS and ELD vehicle data with priority rules:
   * - TMS wins: operational data (make, model, year, vin, licensePlate, status)
   * - ELD wins: telematics data (serial, gateway, esn)
   * - ELD fills gaps when TMS data is missing
   */
  merge(tmsData: TmsVehicleData = {}, eldData: EldVehicleData = {}): MergedVehicleData {
    const merged: MergedVehicleData = {
      // Operational data: TMS wins, ELD fills gaps
      make: tmsData.make || eldData.make,
      model: tmsData.model || eldData.model,
      year: tmsData.year || eldData.year,
      vin: tmsData.vin || eldData.vin,
      licensePlate: tmsData.licensePlate || eldData.licensePlate,
      status: tmsData.status,
      capacity: tmsData.capacity,
    };

    // Package ELD telematics data into JSONB
    if (eldData.eldId) {
      merged.eldTelematicsMetadata = {
        eldVendor: eldData.eldVendor,
        eldId: eldData.eldId,
        serial: eldData.serial,
        gateway: eldData.gateway,
        esn: eldData.esn,
        cameraSerial: eldData.cameraSerial || null,
        lastSyncAt: new Date().toISOString(),
      };
    }

    return merged;
  }
}
