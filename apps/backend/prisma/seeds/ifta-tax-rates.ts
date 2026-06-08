import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const Q1_2026_RATES = [
  { jurisdiction: 'AL', jurisdictionName: 'Alabama', taxRatePerGallon: 0.29, surchargeRate: 0 },
  { jurisdiction: 'AZ', jurisdictionName: 'Arizona', taxRatePerGallon: 0.26, surchargeRate: 0 },
  { jurisdiction: 'AR', jurisdictionName: 'Arkansas', taxRatePerGallon: 0.285, surchargeRate: 0 },
  { jurisdiction: 'CA', jurisdictionName: 'California', taxRatePerGallon: 0.68, surchargeRate: 0 },
  { jurisdiction: 'CO', jurisdictionName: 'Colorado', taxRatePerGallon: 0.22, surchargeRate: 0 },
  { jurisdiction: 'CT', jurisdictionName: 'Connecticut', taxRatePerGallon: 0.441, surchargeRate: 0 },
  { jurisdiction: 'DE', jurisdictionName: 'Delaware', taxRatePerGallon: 0.22, surchargeRate: 0 },
  { jurisdiction: 'FL', jurisdictionName: 'Florida', taxRatePerGallon: 0.35, surchargeRate: 0 },
  { jurisdiction: 'GA', jurisdictionName: 'Georgia', taxRatePerGallon: 0.334, surchargeRate: 0 },
  { jurisdiction: 'ID', jurisdictionName: 'Idaho', taxRatePerGallon: 0.38, surchargeRate: 0 },
  { jurisdiction: 'IL', jurisdictionName: 'Illinois', taxRatePerGallon: 0.467, surchargeRate: 0 },
  { jurisdiction: 'IN', jurisdictionName: 'Indiana', taxRatePerGallon: 0.54, surchargeRate: 0.11 },
  { jurisdiction: 'IA', jurisdictionName: 'Iowa', taxRatePerGallon: 0.325, surchargeRate: 0 },
  { jurisdiction: 'KS', jurisdictionName: 'Kansas', taxRatePerGallon: 0.26, surchargeRate: 0 },
  { jurisdiction: 'KY', jurisdictionName: 'Kentucky', taxRatePerGallon: 0.246, surchargeRate: 0.02 },
  { jurisdiction: 'LA', jurisdictionName: 'Louisiana', taxRatePerGallon: 0.2, surchargeRate: 0 },
  { jurisdiction: 'ME', jurisdictionName: 'Maine', taxRatePerGallon: 0.312, surchargeRate: 0 },
  { jurisdiction: 'MD', jurisdictionName: 'Maryland', taxRatePerGallon: 0.417, surchargeRate: 0 },
  { jurisdiction: 'MA', jurisdictionName: 'Massachusetts', taxRatePerGallon: 0.24, surchargeRate: 0 },
  { jurisdiction: 'MI', jurisdictionName: 'Michigan', taxRatePerGallon: 0.467, surchargeRate: 0 },
  { jurisdiction: 'MN', jurisdictionName: 'Minnesota', taxRatePerGallon: 0.285, surchargeRate: 0 },
  { jurisdiction: 'MS', jurisdictionName: 'Mississippi', taxRatePerGallon: 0.18, surchargeRate: 0 },
  { jurisdiction: 'MO', jurisdictionName: 'Missouri', taxRatePerGallon: 0.22, surchargeRate: 0 },
  { jurisdiction: 'MT', jurisdictionName: 'Montana', taxRatePerGallon: 0.3275, surchargeRate: 0 },
  { jurisdiction: 'NE', jurisdictionName: 'Nebraska', taxRatePerGallon: 0.286, surchargeRate: 0 },
  { jurisdiction: 'NV', jurisdictionName: 'Nevada', taxRatePerGallon: 0.27, surchargeRate: 0 },
  { jurisdiction: 'NH', jurisdictionName: 'New Hampshire', taxRatePerGallon: 0.222, surchargeRate: 0 },
  { jurisdiction: 'NJ', jurisdictionName: 'New Jersey', taxRatePerGallon: 0.415, surchargeRate: 0 },
  { jurisdiction: 'NM', jurisdictionName: 'New Mexico', taxRatePerGallon: 0.21, surchargeRate: 0 },
  { jurisdiction: 'NY', jurisdictionName: 'New York', taxRatePerGallon: 0.336, surchargeRate: 0.178 },
  { jurisdiction: 'NC', jurisdictionName: 'North Carolina', taxRatePerGallon: 0.402, surchargeRate: 0 },
  { jurisdiction: 'ND', jurisdictionName: 'North Dakota', taxRatePerGallon: 0.23, surchargeRate: 0 },
  { jurisdiction: 'OH', jurisdictionName: 'Ohio', taxRatePerGallon: 0.385, surchargeRate: 0 },
  { jurisdiction: 'OK', jurisdictionName: 'Oklahoma', taxRatePerGallon: 0.19, surchargeRate: 0 },
  { jurisdiction: 'OR', jurisdictionName: 'Oregon', taxRatePerGallon: 0.38, surchargeRate: 0 },
  { jurisdiction: 'PA', jurisdictionName: 'Pennsylvania', taxRatePerGallon: 0.741, surchargeRate: 0 },
  { jurisdiction: 'RI', jurisdictionName: 'Rhode Island', taxRatePerGallon: 0.34, surchargeRate: 0 },
  { jurisdiction: 'SC', jurisdictionName: 'South Carolina', taxRatePerGallon: 0.28, surchargeRate: 0 },
  { jurisdiction: 'SD', jurisdictionName: 'South Dakota', taxRatePerGallon: 0.28, surchargeRate: 0 },
  { jurisdiction: 'TN', jurisdictionName: 'Tennessee', taxRatePerGallon: 0.27, surchargeRate: 0 },
  { jurisdiction: 'TX', jurisdictionName: 'Texas', taxRatePerGallon: 0.2, surchargeRate: 0 },
  { jurisdiction: 'UT', jurisdictionName: 'Utah', taxRatePerGallon: 0.315, surchargeRate: 0 },
  { jurisdiction: 'VT', jurisdictionName: 'Vermont', taxRatePerGallon: 0.312, surchargeRate: 0 },
  { jurisdiction: 'VA', jurisdictionName: 'Virginia', taxRatePerGallon: 0.302, surchargeRate: 0 },
  { jurisdiction: 'WA', jurisdictionName: 'Washington', taxRatePerGallon: 0.494, surchargeRate: 0 },
  { jurisdiction: 'WV', jurisdictionName: 'West Virginia', taxRatePerGallon: 0.357, surchargeRate: 0 },
  { jurisdiction: 'WI', jurisdictionName: 'Wisconsin', taxRatePerGallon: 0.329, surchargeRate: 0 },
  { jurisdiction: 'WY', jurisdictionName: 'Wyoming', taxRatePerGallon: 0.24, surchargeRate: 0 },
];

async function seedIftaTaxRates() {
  console.log('Seeding IFTA tax rates for Q1 2026...');
  for (const rate of Q1_2026_RATES) {
    await prisma.iftaTaxRate.upsert({
      where: {
        jurisdiction_year_quarter: {
          jurisdiction: rate.jurisdiction,
          year: 2026,
          quarter: 1,
        },
      },
      update: {
        taxRatePerGallon: rate.taxRatePerGallon,
        surchargeRate: rate.surchargeRate,
        jurisdictionName: rate.jurisdictionName,
      },
      create: {
        ...rate,
        year: 2026,
        quarter: 1,
        effectiveDate: new Date('2026-01-01'),
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${Q1_2026_RATES.length} IFTA tax rates.`);
}

seedIftaTaxRates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
