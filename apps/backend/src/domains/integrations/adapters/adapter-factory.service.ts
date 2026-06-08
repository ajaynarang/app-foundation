import { Injectable, Logger } from '@nestjs/common';
import { ITMSAdapter } from './tms/tms-adapter.interface';
import { IELDAdapter } from './eld/eld-adapter.interface';
import { Project44TMSAdapter } from './tms/project44-tms.adapter';
import { McLeodTMSAdapter } from './tms/mcleod-tms.adapter';
import { SamsaraELDAdapter } from './eld/samsara-eld.adapter';
import { IAccountingAdapter } from '../accounting/accounting-adapter.interface';
import { QuickBooksAdapter } from '../accounting/vendors/quickbooks/quickbooks.adapter';
import type { ILoadBoardAdapter } from '../load-board/interfaces/load-board-adapter.interface';
import { DATLoadBoardAdapter } from '../load-board/adapters/dat/dat-load-board.adapter';

/**
 * Adapter Factory Service
 *
 * Central registry that maps vendor IDs to adapter instances.
 * This is the ONLY place where vendor-to-adapter mapping happens.
 *
 * When adding a new vendor:
 * 1. Create the adapter class implementing ITMSAdapter or IELDAdapter
 * 2. Add it to the constructor
 * 3. Add mapping in getTMSAdapter() or getELDAdapter()
 * 4. Add to SyncModule providers
 */
@Injectable()
export class AdapterFactoryService {
  private readonly logger = new Logger(AdapterFactoryService.name);

  constructor(
    // TMS Adapters
    private project44Adapter: Project44TMSAdapter,
    private mcleodAdapter: McLeodTMSAdapter,

    // ELD Adapters
    private samsaraELDAdapter: SamsaraELDAdapter,

    // Accounting Adapters
    private quickbooksAdapter: QuickBooksAdapter,

    // Load Board Adapters
    private datLoadBoardAdapter: DATLoadBoardAdapter,
  ) {}

  /**
   * Get TMS adapter for a vendor
   * @param vendor - Vendor ID from vendor registry (e.g., 'PROJECT44_TMS')
   * @returns TMS adapter instance or null if not supported
   */
  getTMSAdapter(vendor: string): ITMSAdapter | null {
    const adapterMap: Record<string, ITMSAdapter> = {
      PROJECT44_TMS: this.project44Adapter,
      MCLEOD_TMS: this.mcleodAdapter,
      TMW_TMS: this.mcleodAdapter, // TMW uses similar API to McLeod
    };

    return adapterMap[vendor] || null;
  }

  /**
   * Get ELD adapter for a vendor
   * @param vendor - Vendor ID from vendor registry (e.g., 'SAMSARA_ELD')
   * @returns ELD adapter instance or null if not supported
   */
  getELDAdapter(vendor: string): IELDAdapter | null {
    const adapterMap: Record<string, IELDAdapter> = {
      SAMSARA_ELD: this.samsaraELDAdapter,
      MOTIVE_ELD: this.samsaraELDAdapter, // Motive uses similar API to Samsara
    };

    return adapterMap[vendor] || null;
  }

  /**
   * Get accounting adapter for a vendor
   * @param vendor - Vendor ID from vendor registry (e.g., 'QUICKBOOKS')
   * @returns Accounting adapter instance or null if not supported
   */
  getAccountingAdapter(vendor: string): IAccountingAdapter | null {
    const adapterMap: Record<string, IAccountingAdapter> = {
      QUICKBOOKS: this.quickbooksAdapter,
    };
    return adapterMap[vendor] || null;
  }

  /**
   * Check if a TMS vendor is supported
   */
  isTMSVendorSupported(vendor: string): boolean {
    return this.getTMSAdapter(vendor) !== null;
  }

  /**
   * Check if an ELD vendor is supported
   */
  isELDVendorSupported(vendor: string): boolean {
    return this.getELDAdapter(vendor) !== null;
  }

  /**
   * Check if an accounting vendor is supported
   */
  isAccountingVendorSupported(vendor: string): boolean {
    return this.getAccountingAdapter(vendor) !== null;
  }

  getLoadBoardAdapter(vendor: string): ILoadBoardAdapter | null {
    const adapterMap: Record<string, ILoadBoardAdapter> = {
      DAT_LOAD_BOARD: this.datLoadBoardAdapter,
    };
    return adapterMap[vendor] || null;
  }

  isLoadBoardVendorSupported(vendor: string): boolean {
    return this.getLoadBoardAdapter(vendor) !== null;
  }
}
