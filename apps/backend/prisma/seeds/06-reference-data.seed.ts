import { PrismaClient } from '@prisma/client';

const REFERENCE_DATA = [
  // Equipment Types
  { category: 'equipment_type', code: 'DRY_VAN', label: 'Dry Van', sortOrder: 1, metadata: {} },
  { category: 'equipment_type', code: 'FLATBED', label: 'Flatbed', sortOrder: 2, metadata: {} },
  { category: 'equipment_type', code: 'REEFER', label: 'Reefer', sortOrder: 3, metadata: {} },
  { category: 'equipment_type', code: 'STEP_DECK', label: 'Step Deck', sortOrder: 4, metadata: {} },
  { category: 'equipment_type', code: 'POWER_ONLY', label: 'Power Only', sortOrder: 5, metadata: {} },
  { category: 'equipment_type', code: 'OTHER', label: 'Other', sortOrder: 6, metadata: {} },

  // Vehicle Statuses
  {
    category: 'vehicle_status',
    code: 'AVAILABLE',
    label: 'Available',
    sortOrder: 1,
    metadata: { color: 'green', badgeVariant: 'outline' },
  },
  {
    category: 'vehicle_status',
    code: 'ASSIGNED',
    label: 'Assigned',
    sortOrder: 2,
    metadata: { color: 'blue', badgeVariant: 'filled' },
  },
  {
    category: 'vehicle_status',
    code: 'IN_SHOP',
    label: 'In Shop',
    sortOrder: 3,
    metadata: { color: 'amber', badgeVariant: 'outline' },
  },
  {
    category: 'vehicle_status',
    code: 'OUT_OF_SERVICE',
    label: 'Out of Service',
    sortOrder: 4,
    metadata: { color: 'red', badgeVariant: 'outline' },
  },

  // Driver Statuses
  {
    category: 'driver_status',
    code: 'PENDING_ACTIVATION',
    label: 'Pending Activation',
    sortOrder: 1,
    metadata: { color: 'amber' },
  },
  { category: 'driver_status', code: 'ACTIVE', label: 'Active', sortOrder: 2, metadata: { color: 'green' } },
  { category: 'driver_status', code: 'INACTIVE', label: 'Inactive', sortOrder: 3, metadata: { color: 'gray' } },
  { category: 'driver_status', code: 'SUSPENDED', label: 'Suspended', sortOrder: 4, metadata: { color: 'red' } },

  // CDL Classes
  {
    category: 'cdl_class',
    code: 'A',
    label: 'Class A',
    sortOrder: 1,
    metadata: { description: 'Combination vehicles (tractor-trailers)' },
  },
  {
    category: 'cdl_class',
    code: 'B',
    label: 'Class B',
    sortOrder: 2,
    metadata: { description: 'Single vehicles over 26,001 lbs' },
  },
  {
    category: 'cdl_class',
    code: 'C',
    label: 'Class C',
    sortOrder: 3,
    metadata: { description: 'Vehicles with 16+ passengers or hazmat' },
  },

  // Endorsements
  { category: 'endorsement', code: 'HAZMAT', label: 'Hazmat (H)', sortOrder: 1, metadata: { letter: 'H' } },
  { category: 'endorsement', code: 'TANKER', label: 'Tanker (N)', sortOrder: 2, metadata: { letter: 'N' } },
  {
    category: 'endorsement',
    code: 'DOUBLES_TRIPLES',
    label: 'Doubles/Triples (T)',
    sortOrder: 3,
    metadata: { letter: 'T' },
  },
  { category: 'endorsement', code: 'PASSENGER', label: 'Passenger (P)', sortOrder: 4, metadata: { letter: 'P' } },
  { category: 'endorsement', code: 'SCHOOL_BUS', label: 'School Bus (S)', sortOrder: 5, metadata: { letter: 'S' } },

  // Phone-allowed countries (smsEnabled controls which countries can receive OTP)
  {
    category: 'country',
    code: 'US',
    label: 'United States',
    sortOrder: 1,
    metadata: { dialCode: '+1', flag: '🇺🇸', smsEnabled: true },
  },
  {
    category: 'country',
    code: 'IN',
    label: 'India',
    sortOrder: 2,
    metadata: { dialCode: '+91', flag: '🇮🇳', smsEnabled: true },
  },
  {
    category: 'country',
    code: 'CA',
    label: 'Canada',
    sortOrder: 3,
    metadata: { dialCode: '+1', flag: '🇨🇦', smsEnabled: false },
  },
  {
    category: 'country',
    code: 'MX',
    label: 'Mexico',
    sortOrder: 4,
    metadata: { dialCode: '+52', flag: '🇲🇽', smsEnabled: false },
  },

  // US States
  { category: 'us_state', code: 'AL', label: 'Alabama', sortOrder: 1, metadata: {} },
  { category: 'us_state', code: 'AK', label: 'Alaska', sortOrder: 2, metadata: {} },
  { category: 'us_state', code: 'AZ', label: 'Arizona', sortOrder: 3, metadata: {} },
  { category: 'us_state', code: 'AR', label: 'Arkansas', sortOrder: 4, metadata: {} },
  { category: 'us_state', code: 'CA', label: 'California', sortOrder: 5, metadata: {} },
  { category: 'us_state', code: 'CO', label: 'Colorado', sortOrder: 6, metadata: {} },
  { category: 'us_state', code: 'CT', label: 'Connecticut', sortOrder: 7, metadata: {} },
  { category: 'us_state', code: 'DE', label: 'Delaware', sortOrder: 8, metadata: {} },
  { category: 'us_state', code: 'FL', label: 'Florida', sortOrder: 9, metadata: {} },
  { category: 'us_state', code: 'GA', label: 'Georgia', sortOrder: 10, metadata: {} },
  { category: 'us_state', code: 'HI', label: 'Hawaii', sortOrder: 11, metadata: {} },
  { category: 'us_state', code: 'ID', label: 'Idaho', sortOrder: 12, metadata: {} },
  { category: 'us_state', code: 'IL', label: 'Illinois', sortOrder: 13, metadata: {} },
  { category: 'us_state', code: 'IN', label: 'Indiana', sortOrder: 14, metadata: {} },
  { category: 'us_state', code: 'IA', label: 'Iowa', sortOrder: 15, metadata: {} },
  { category: 'us_state', code: 'KS', label: 'Kansas', sortOrder: 16, metadata: {} },
  { category: 'us_state', code: 'KY', label: 'Kentucky', sortOrder: 17, metadata: {} },
  { category: 'us_state', code: 'LA', label: 'Louisiana', sortOrder: 18, metadata: {} },
  { category: 'us_state', code: 'ME', label: 'Maine', sortOrder: 19, metadata: {} },
  { category: 'us_state', code: 'MD', label: 'Maryland', sortOrder: 20, metadata: {} },
  { category: 'us_state', code: 'MA', label: 'Massachusetts', sortOrder: 21, metadata: {} },
  { category: 'us_state', code: 'MI', label: 'Michigan', sortOrder: 22, metadata: {} },
  { category: 'us_state', code: 'MN', label: 'Minnesota', sortOrder: 23, metadata: {} },
  { category: 'us_state', code: 'MS', label: 'Mississippi', sortOrder: 24, metadata: {} },
  { category: 'us_state', code: 'MO', label: 'Missouri', sortOrder: 25, metadata: {} },
  { category: 'us_state', code: 'MT', label: 'Montana', sortOrder: 26, metadata: {} },
  { category: 'us_state', code: 'NE', label: 'Nebraska', sortOrder: 27, metadata: {} },
  { category: 'us_state', code: 'NV', label: 'Nevada', sortOrder: 28, metadata: {} },
  { category: 'us_state', code: 'NH', label: 'New Hampshire', sortOrder: 29, metadata: {} },
  { category: 'us_state', code: 'NJ', label: 'New Jersey', sortOrder: 30, metadata: {} },
  { category: 'us_state', code: 'NM', label: 'New Mexico', sortOrder: 31, metadata: {} },
  { category: 'us_state', code: 'NY', label: 'New York', sortOrder: 32, metadata: {} },
  { category: 'us_state', code: 'NC', label: 'North Carolina', sortOrder: 33, metadata: {} },
  { category: 'us_state', code: 'ND', label: 'North Dakota', sortOrder: 34, metadata: {} },
  { category: 'us_state', code: 'OH', label: 'Ohio', sortOrder: 35, metadata: {} },
  { category: 'us_state', code: 'OK', label: 'Oklahoma', sortOrder: 36, metadata: {} },
  { category: 'us_state', code: 'OR', label: 'Oregon', sortOrder: 37, metadata: {} },
  { category: 'us_state', code: 'PA', label: 'Pennsylvania', sortOrder: 38, metadata: {} },
  { category: 'us_state', code: 'RI', label: 'Rhode Island', sortOrder: 39, metadata: {} },
  { category: 'us_state', code: 'SC', label: 'South Carolina', sortOrder: 40, metadata: {} },
  { category: 'us_state', code: 'SD', label: 'South Dakota', sortOrder: 41, metadata: {} },
  { category: 'us_state', code: 'TN', label: 'Tennessee', sortOrder: 42, metadata: {} },
  { category: 'us_state', code: 'TX', label: 'Texas', sortOrder: 43, metadata: {} },
  { category: 'us_state', code: 'UT', label: 'Utah', sortOrder: 44, metadata: {} },
  { category: 'us_state', code: 'VT', label: 'Vermont', sortOrder: 45, metadata: {} },
  { category: 'us_state', code: 'VA', label: 'Virginia', sortOrder: 46, metadata: {} },
  { category: 'us_state', code: 'WA', label: 'Washington', sortOrder: 47, metadata: {} },
  { category: 'us_state', code: 'WV', label: 'West Virginia', sortOrder: 48, metadata: {} },
  { category: 'us_state', code: 'WI', label: 'Wisconsin', sortOrder: 49, metadata: {} },
  { category: 'us_state', code: 'WY', label: 'Wyoming', sortOrder: 50, metadata: {} },

  // Freight Cities — major US freight hubs for load board city search
  // code = city name, label = "City, ST" display, metadata.state = state code
  { category: 'freight_city', code: 'Allentown', label: 'Allentown, PA', sortOrder: 1, metadata: { state: 'PA' } },
  { category: 'freight_city', code: 'Atlanta', label: 'Atlanta, GA', sortOrder: 2, metadata: { state: 'GA' } },
  { category: 'freight_city', code: 'Baltimore', label: 'Baltimore, MD', sortOrder: 3, metadata: { state: 'MD' } },
  { category: 'freight_city', code: 'Birmingham', label: 'Birmingham, AL', sortOrder: 4, metadata: { state: 'AL' } },
  { category: 'freight_city', code: 'Boise', label: 'Boise, ID', sortOrder: 5, metadata: { state: 'ID' } },
  { category: 'freight_city', code: 'Boston', label: 'Boston, MA', sortOrder: 6, metadata: { state: 'MA' } },
  { category: 'freight_city', code: 'Buffalo', label: 'Buffalo, NY', sortOrder: 7, metadata: { state: 'NY' } },
  { category: 'freight_city', code: 'Charleston', label: 'Charleston, SC', sortOrder: 8, metadata: { state: 'SC' } },
  { category: 'freight_city', code: 'Charlotte', label: 'Charlotte, NC', sortOrder: 9, metadata: { state: 'NC' } },
  { category: 'freight_city', code: 'Chicago', label: 'Chicago, IL', sortOrder: 10, metadata: { state: 'IL' } },
  { category: 'freight_city', code: 'Cincinnati', label: 'Cincinnati, OH', sortOrder: 11, metadata: { state: 'OH' } },
  { category: 'freight_city', code: 'Cleveland', label: 'Cleveland, OH', sortOrder: 12, metadata: { state: 'OH' } },
  { category: 'freight_city', code: 'Columbus', label: 'Columbus, OH', sortOrder: 13, metadata: { state: 'OH' } },
  { category: 'freight_city', code: 'Dallas', label: 'Dallas, TX', sortOrder: 14, metadata: { state: 'TX' } },
  { category: 'freight_city', code: 'Denver', label: 'Denver, CO', sortOrder: 15, metadata: { state: 'CO' } },
  { category: 'freight_city', code: 'Des Moines', label: 'Des Moines, IA', sortOrder: 16, metadata: { state: 'IA' } },
  { category: 'freight_city', code: 'Detroit', label: 'Detroit, MI', sortOrder: 17, metadata: { state: 'MI' } },
  { category: 'freight_city', code: 'El Paso', label: 'El Paso, TX', sortOrder: 18, metadata: { state: 'TX' } },
  { category: 'freight_city', code: 'Fresno', label: 'Fresno, CA', sortOrder: 19, metadata: { state: 'CA' } },
  { category: 'freight_city', code: 'Greenville', label: 'Greenville, SC', sortOrder: 20, metadata: { state: 'SC' } },
  { category: 'freight_city', code: 'Harrisburg', label: 'Harrisburg, PA', sortOrder: 21, metadata: { state: 'PA' } },
  { category: 'freight_city', code: 'Houston', label: 'Houston, TX', sortOrder: 22, metadata: { state: 'TX' } },
  {
    category: 'freight_city',
    code: 'Indianapolis',
    label: 'Indianapolis, IN',
    sortOrder: 23,
    metadata: { state: 'IN' },
  },
  {
    category: 'freight_city',
    code: 'Jacksonville',
    label: 'Jacksonville, FL',
    sortOrder: 24,
    metadata: { state: 'FL' },
  },
  { category: 'freight_city', code: 'Kansas City', label: 'Kansas City, MO', sortOrder: 25, metadata: { state: 'MO' } },
  { category: 'freight_city', code: 'Laredo', label: 'Laredo, TX', sortOrder: 26, metadata: { state: 'TX' } },
  { category: 'freight_city', code: 'Little Rock', label: 'Little Rock, AR', sortOrder: 27, metadata: { state: 'AR' } },
  { category: 'freight_city', code: 'Los Angeles', label: 'Los Angeles, CA', sortOrder: 28, metadata: { state: 'CA' } },
  { category: 'freight_city', code: 'Louisville', label: 'Louisville, KY', sortOrder: 29, metadata: { state: 'KY' } },
  { category: 'freight_city', code: 'Memphis', label: 'Memphis, TN', sortOrder: 30, metadata: { state: 'TN' } },
  { category: 'freight_city', code: 'Miami', label: 'Miami, FL', sortOrder: 31, metadata: { state: 'FL' } },
  { category: 'freight_city', code: 'Milwaukee', label: 'Milwaukee, WI', sortOrder: 32, metadata: { state: 'WI' } },
  { category: 'freight_city', code: 'Minneapolis', label: 'Minneapolis, MN', sortOrder: 33, metadata: { state: 'MN' } },
  { category: 'freight_city', code: 'Nashville', label: 'Nashville, TN', sortOrder: 34, metadata: { state: 'TN' } },
  { category: 'freight_city', code: 'New Orleans', label: 'New Orleans, LA', sortOrder: 35, metadata: { state: 'LA' } },
  { category: 'freight_city', code: 'New York', label: 'New York, NY', sortOrder: 36, metadata: { state: 'NY' } },
  { category: 'freight_city', code: 'Newark', label: 'Newark, NJ', sortOrder: 37, metadata: { state: 'NJ' } },
  { category: 'freight_city', code: 'Norfolk', label: 'Norfolk, VA', sortOrder: 38, metadata: { state: 'VA' } },
  {
    category: 'freight_city',
    code: 'Oklahoma City',
    label: 'Oklahoma City, OK',
    sortOrder: 39,
    metadata: { state: 'OK' },
  },
  { category: 'freight_city', code: 'Omaha', label: 'Omaha, NE', sortOrder: 40, metadata: { state: 'NE' } },
  {
    category: 'freight_city',
    code: 'Philadelphia',
    label: 'Philadelphia, PA',
    sortOrder: 41,
    metadata: { state: 'PA' },
  },
  { category: 'freight_city', code: 'Phoenix', label: 'Phoenix, AZ', sortOrder: 42, metadata: { state: 'AZ' } },
  { category: 'freight_city', code: 'Pittsburgh', label: 'Pittsburgh, PA', sortOrder: 43, metadata: { state: 'PA' } },
  { category: 'freight_city', code: 'Portland', label: 'Portland, OR', sortOrder: 44, metadata: { state: 'OR' } },
  { category: 'freight_city', code: 'Raleigh', label: 'Raleigh, NC', sortOrder: 45, metadata: { state: 'NC' } },
  { category: 'freight_city', code: 'Reno', label: 'Reno, NV', sortOrder: 46, metadata: { state: 'NV' } },
  { category: 'freight_city', code: 'Richmond', label: 'Richmond, VA', sortOrder: 47, metadata: { state: 'VA' } },
  { category: 'freight_city', code: 'Sacramento', label: 'Sacramento, CA', sortOrder: 48, metadata: { state: 'CA' } },
  {
    category: 'freight_city',
    code: 'Salt Lake City',
    label: 'Salt Lake City, UT',
    sortOrder: 49,
    metadata: { state: 'UT' },
  },
  { category: 'freight_city', code: 'San Antonio', label: 'San Antonio, TX', sortOrder: 50, metadata: { state: 'TX' } },
  {
    category: 'freight_city',
    code: 'San Bernardino',
    label: 'San Bernardino, CA',
    sortOrder: 51,
    metadata: { state: 'CA' },
  },
  { category: 'freight_city', code: 'Savannah', label: 'Savannah, GA', sortOrder: 52, metadata: { state: 'GA' } },
  { category: 'freight_city', code: 'Seattle', label: 'Seattle, WA', sortOrder: 53, metadata: { state: 'WA' } },
  { category: 'freight_city', code: 'Spokane', label: 'Spokane, WA', sortOrder: 54, metadata: { state: 'WA' } },
  { category: 'freight_city', code: 'St. Louis', label: 'St. Louis, MO', sortOrder: 55, metadata: { state: 'MO' } },
  { category: 'freight_city', code: 'Tulsa', label: 'Tulsa, OK', sortOrder: 56, metadata: { state: 'OK' } },
  { category: 'freight_city', code: 'Wichita', label: 'Wichita, KS', sortOrder: 57, metadata: { state: 'KS' } },
];

export const seed = {
  name: 'Reference Data',
  description:
    'Seeds reference data lookup values (equipment types, statuses, CDL classes, endorsements, US states, countries)',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const item of REFERENCE_DATA) {
      const existing = await prisma.referenceData.findUnique({
        where: { category_code: { category: item.category, code: item.code } },
      });

      if (existing) {
        await prisma.referenceData.update({
          where: { category_code: { category: item.category, code: item.code } },
          data: { label: item.label, sortOrder: item.sortOrder, metadata: item.metadata },
        });
        skipped++;
        continue;
      }

      await prisma.referenceData.create({
        data: {
          category: item.category,
          code: item.code,
          label: item.label,
          sortOrder: item.sortOrder,
          metadata: item.metadata,
        },
      });
      created++;
    }

    return { created, skipped };
  },
};
