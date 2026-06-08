import { PrismaClient } from '@prisma/client';

const FUEL_CARD_TYPES = [
  { id: 'OTR', displayName: 'OTR Solutions', description: '8,000+ locations, savings up to $2.25/gal' },
  { id: 'WEX', displayName: 'WEX / Fleet One', description: '12,000+ truck stops, EDGE network' },
  { id: 'EFS', displayName: 'EFS (WEX)', description: "Pilot/FJ, Love's, TA network" },
  { id: 'COMDATA', displayName: 'Comdata', description: '8,000+ locations, cash pricing at pump' },
  { id: 'EDGE', displayName: 'Fleet One EDGE', description: '12,000+ truck stops' },
];

const BRAND_ACCEPTANCE: Record<string, string[]> = {
  'Pilot/Flying J': ['OTR', 'WEX', 'EFS', 'COMDATA', 'EDGE'],
  "Love's": ['WEX', 'EFS', 'COMDATA', 'EDGE'],
  'TA/Petro': ['OTR', 'WEX', 'EFS', 'COMDATA', 'EDGE'],
  AMBEST: ['OTR', 'COMDATA'],
  QuikTrip: ['OTR', 'WEX'],
  "Casey's": ['WEX', 'COMDATA'],
  Sheetz: ['WEX'],
  'Kum & Go': ['WEX', 'COMDATA'],
  "Buc-ee's": ['WEX', 'COMDATA'],
  'Circle K': ['WEX', 'EFS', 'COMDATA'],
};

export const seed = {
  name: 'Fuel Card Types & Brand Acceptance',
  description: 'Seeds platform-level fuel card types and brand-to-card acceptance mappings',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Seed fuel card types
    for (const card of FUEL_CARD_TYPES) {
      const result = await prisma.fuelCardType.upsert({
        where: { id: card.id },
        update: { displayName: card.displayName, description: card.description },
        create: card,
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        skipped++;
      }
    }

    // Seed brand acceptance mappings
    for (const [brand, cardIds] of Object.entries(BRAND_ACCEPTANCE)) {
      for (const fuelCardTypeId of cardIds) {
        const existing = await prisma.brandFuelCardAcceptance.findUnique({
          where: { brand_fuelCardTypeId: { brand, fuelCardTypeId } },
        });

        if (existing) {
          skipped++;
        } else {
          await prisma.brandFuelCardAcceptance.create({
            data: { brand, fuelCardTypeId },
          });
          created++;
        }
      }
    }

    return { created, skipped };
  },
};
