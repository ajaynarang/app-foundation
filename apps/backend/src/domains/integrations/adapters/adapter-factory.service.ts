import { Injectable, Logger } from '@nestjs/common';

/**
 * Adapter Factory Service
 *
 * Central registry that maps vendor IDs to adapter instances. This is the ONLY
 * place where vendor-to-adapter mapping happens.
 *
 * The starter ships with NO vendor adapters wired in. To add a vendor:
 * 1. Create an adapter class implementing your integration-type interface.
 * 2. Inject it into this factory's constructor.
 * 3. Register it in the matching `get*Adapter()` map below.
 * 4. Add the provider to `AdaptersModule`.
 */
@Injectable()
export class AdapterFactoryService {
  private readonly logger = new Logger(AdapterFactoryService.name);

  /**
   * Get an accounting adapter for a vendor.
   * @param vendor - Vendor ID from the vendor registry (e.g. 'QUICKBOOKS')
   * @returns adapter instance, or null if not supported
   */
  getAccountingAdapter(vendor: string): unknown | null {
    const adapterMap: Record<string, unknown> = {};
    return adapterMap[vendor] ?? null;
  }

  /**
   * Check if an accounting vendor is supported.
   */
  isAccountingVendorSupported(vendor: string): boolean {
    return this.getAccountingAdapter(vendor) !== null;
  }
}
