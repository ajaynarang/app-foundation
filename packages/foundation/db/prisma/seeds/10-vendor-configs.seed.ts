import { PrismaClient } from '../../generated/client';

const VENDOR_DEFAULTS: {
  vendorId: string;
  displayOrder: number;
  isAvailable?: boolean;
}[] = [
  // Sample integration vendor. Add more entries here as the catalog grows.
  { vendorId: 'QUICKBOOKS', displayOrder: 1 },
];

export const seed = {
  name: 'Vendor Configs',
  description: 'Seeds default vendor configs for runtime vendor control',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const vendor of VENDOR_DEFAULTS) {
      const result = await prisma.vendorConfig.upsert({
        where: { vendorId: vendor.vendorId },
        update: vendor.isAvailable === false ? { isAvailable: false } : {},
        create: {
          vendorId: vendor.vendorId,
          isAvailable: vendor.isAvailable ?? true,
          isOAuthEnabled: true,
          displayOrder: vendor.displayOrder,
        },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        skipped++;
      }
    }

    return { created, skipped };
  },
};
