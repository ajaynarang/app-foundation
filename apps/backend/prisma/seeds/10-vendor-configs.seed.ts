import { PrismaClient } from '@prisma/client';

const VENDOR_DEFAULTS: {
  vendorId: string;
  displayOrder: number;
  isAvailable?: boolean;
}[] = [
  { vendorId: 'PROJECT44_TMS', displayOrder: 1 },
  { vendorId: 'MCLEOD_TMS', displayOrder: 2, isAvailable: false },
  { vendorId: 'TMW_TMS', displayOrder: 3, isAvailable: false },
  { vendorId: 'SAMSARA_ELD', displayOrder: 1 },
  { vendorId: 'MOTIVE_ELD', displayOrder: 2, isAvailable: false },
  { vendorId: 'QUICKBOOKS', displayOrder: 1 },
  { vendorId: 'DAT_LOAD_BOARD', displayOrder: 1 },
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
