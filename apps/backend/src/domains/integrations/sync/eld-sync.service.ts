import { Injectable } from '@nestjs/common';
import { SyncResult } from '../../../infrastructure/sync/sync-job.types';
import { SyncAction } from '../../../infrastructure/sync/sync-action-log';
import { FleetSyncService } from './fleet-sync.service';
import { HosSyncService } from './hos-sync.service';
import { TelematicsSyncService } from './telematics-sync.service';
import { DvirSyncService } from './dvir-sync.service';

export interface EldSyncResult {
  total: number;
  created: number;
  enriched: number;
  skipped: number;
  errors: number;
  unmatchedItems: { id: string; name: string; matchField: string }[];
  actions: SyncAction[];
}

/**
 * ELD Sync Service — Source of Truth for Fleet Entity Creation
 *
 * Thin facade that delegates to cohesive collaborator services:
 * - FleetSyncService: driver/vehicle/trailer creation and enrichment
 * - HosSyncService: HOS clock sync with failure alerting
 * - TelematicsSyncService: vehicle GPS/fuel/engine telematics
 * - DvirSyncService: Driver Vehicle Inspection Reports
 *
 * Uses AdapterFactory for vendor-agnostic adapter selection.
 *
 * Flow: ELD creates drivers/vehicles from ELD data. TMS enriches with business data.
 */
@Injectable()
export class EldSyncService {
  constructor(
    private fleetSync: FleetSyncService,
    private hosSync: HosSyncService,
    private telematicsSync: TelematicsSyncService,
    private dvirSync: DvirSyncService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Fleet Creation & Enrichment — ELD is source of truth for entity creation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sync vehicles from ELD API.
   * Creates new vehicles if no match is found (ELD is source of truth).
   * Enriches existing vehicles with ELD metadata if matched.
   */
  async syncVehicles(integrationId: number): Promise<EldSyncResult> {
    return this.fleetSync.syncVehicles(integrationId);
  }

  /**
   * Sync trailers from ELD API.
   * Creates new trailers if no match is found (ELD is source of truth).
   * Enriches existing trailers with ELD metadata if matched.
   */
  async syncTrailers(integrationId: number): Promise<EldSyncResult> {
    return this.fleetSync.syncTrailers(integrationId);
  }

  /**
   * Sync drivers from ELD API.
   * Creates new drivers if no match is found (ELD is source of truth).
   * Enriches existing drivers with ELD metadata if matched.
   */
  async syncDrivers(integrationId: number): Promise<EldSyncResult> {
    return this.fleetSync.syncDrivers(integrationId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HOS Sync — fetch HOS clocks for all active drivers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sync HOS data for all active drivers of an integration's tenant.
   * Uses Promise.allSettled for per-driver error resilience.
   * Alerts dispatchers on repeated failures (3+ in last hour).
   */
  async syncHos(integrationId: number): Promise<SyncResult> {
    return this.hosSync.syncHos(integrationId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Telematics Sync — vehicle GPS location updates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sync vehicle telematics via cursor-based feed endpoint.
   * Reads cursor from integrationConfig.syncMetadata, fetches delta,
   * writes fuelLevel/engineRunning/odometer alongside GPS, saves new cursor.
   */
  async syncTelematics(integrationId: number): Promise<SyncResult> {
    return this.telematicsSync.syncTelematics(integrationId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DVIR Sync — Driver Vehicle Inspection Reports from Samsara
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sync DVIRs from Samsara for the last 48 hours.
   * Matches vehicles by eldTelematicsMetadata.eldId, drivers by eldMetadata.eldId.
   * Uses Promise.allSettled for per-DVIR resilience.
   */
  async syncDVIRs(integrationId: number): Promise<EldSyncResult> {
    return this.dvirSync.syncDVIRs(integrationId);
  }
}
