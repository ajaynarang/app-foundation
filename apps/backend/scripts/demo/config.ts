// Demo Data Engine — Configuration
// All constants for deterministic demo data generation

export const DEMO_TENANT_ID = 'demo-northstar-2026';
export const DEMO_TENANT_NAME = 'Northstar Logistics';
export const DEMO_TENANT_SLUG = 'northstar-logistics';
export const DEMO_PLAN = 'ENTERPRISE' as const; // Maps to TenantPlan enum
export const DEMO_PASSWORD = 'Sally@2026';
export const DEMO_EMAIL_DOMAIN = 'northstar-logistics.demo';

export const DEMO_USERS = [
  { email: 'owner@northstar-logistics.demo', name: 'Michael Torres', role: 'OWNER' as const },
  { email: 'dispatch@northstar-logistics.demo', name: 'Sarah Mitchell', role: 'DISPATCHER' as const },
  { email: 'dispatch2@northstar-logistics.demo', name: 'Lisa Patel', role: 'DISPATCHER' as const },
  { email: 'dispatch3@northstar-logistics.demo', name: "Kevin O'Brien", role: 'DISPATCHER' as const },
  { email: 'ops@northstar-logistics.demo', name: 'James Rivera', role: 'DISPATCHER' as const },
  { email: 'admin@northstar-logistics.demo', name: 'David Chen', role: 'ADMIN' as const },
  { email: 'customer@northstar-logistics.demo', name: 'NE Dist. Rep', role: 'CUSTOMER' as const },
];

export const DEMO_CUSTOMERS = [
  {
    name: 'Northeast Distribution Co.',
    shortCode: 'NEDC',
    poFormat: 'NEDC-####',
    paymentTermsDays: 15,
    behavior: 'reliable' as const,
  },
  {
    name: 'Atlantic Cold Storage',
    shortCode: 'ACS',
    poFormat: 'ACS-PO-#####',
    paymentTermsDays: 30,
    behavior: 'on_time' as const,
  },
  {
    name: 'Harbor Freight Solutions',
    shortCode: 'HFS',
    poFormat: 'HFS-####-##',
    paymentTermsDays: 45,
    behavior: 'slow_payer' as const,
  },
  {
    name: 'Pilgrim Manufacturing',
    shortCode: 'PM',
    poFormat: 'PM-####',
    paymentTermsDays: 30,
    behavior: 'reliable' as const,
  },
  {
    name: 'Cape Cod Seafood Export',
    shortCode: 'CCSE',
    poFormat: 'CCSE-#####',
    paymentTermsDays: 15,
    behavior: 'fast_payer' as const,
  },
  {
    name: 'Granite State Lumber',
    shortCode: 'GSL',
    poFormat: 'GSL-PO-####',
    paymentTermsDays: 30,
    behavior: 'steady' as const,
  },
  {
    name: 'Connecticut Valley Foods',
    shortCode: 'CVF',
    poFormat: 'CVF-####',
    paymentTermsDays: 30,
    behavior: 'reliable' as const,
  },
  {
    name: 'Rhode Island Steel Works',
    shortCode: 'RISW',
    poFormat: 'RISW-####',
    paymentTermsDays: 45,
    behavior: 'slow_payer' as const,
  },
];

// All rates in CENTS
export const DEMO_LANES = [
  {
    origin: 'Boston, MA',
    destination: 'New York, NY',
    miles: 215,
    minRate: 80000,
    maxRate: 120000,
    equipment: 'DRY_VAN',
    frequency: 'daily',
  },
  {
    origin: 'Boston, MA',
    destination: 'Hartford, CT',
    miles: 100,
    minRate: 45000,
    maxRate: 65000,
    equipment: 'DRY_VAN',
    frequency: 'daily',
  },
  {
    origin: 'Boston, MA',
    destination: 'Providence, RI',
    miles: 50,
    minRate: 30000,
    maxRate: 45000,
    equipment: 'DRY_VAN',
    frequency: 'daily',
  },
  {
    origin: 'Boston, MA',
    destination: 'Manchester, NH',
    miles: 55,
    minRate: 35000,
    maxRate: 50000,
    equipment: 'FLATBED',
    frequency: '3x_week',
  },
  {
    origin: 'Boston, MA',
    destination: 'Portland, ME',
    miles: 110,
    minRate: 50000,
    maxRate: 70000,
    equipment: 'DRY_VAN',
    frequency: '2x_week',
  },
  {
    origin: 'Worcester, MA',
    destination: 'New York, NY',
    miles: 185,
    minRate: 75000,
    maxRate: 100000,
    equipment: 'DRY_VAN',
    frequency: '3x_week',
  },
  {
    origin: 'New Bedford, MA',
    destination: 'Boston, MA',
    miles: 60,
    minRate: 40000,
    maxRate: 60000,
    equipment: 'REEFER',
    frequency: 'daily',
  },
  {
    origin: 'Hyannis, MA',
    destination: 'Boston, MA',
    miles: 70,
    minRate: 50000,
    maxRate: 75000,
    equipment: 'REEFER',
    frequency: 'seasonal',
  },
  {
    origin: 'Hartford, CT',
    destination: 'Providence, RI',
    miles: 95,
    minRate: 40000,
    maxRate: 55000,
    equipment: 'DRY_VAN',
    frequency: '2x_week',
  },
  {
    origin: 'Plymouth, MA',
    destination: 'New York, NY',
    miles: 235,
    minRate: 90000,
    maxRate: 130000,
    equipment: 'FLATBED',
    frequency: '2x_week',
  },
  {
    origin: 'Manchester, NH',
    destination: 'Hartford, CT',
    miles: 160,
    minRate: 60000,
    maxRate: 85000,
    equipment: 'FLATBED',
    frequency: 'weekly',
  },
  {
    origin: 'Providence, RI',
    destination: 'Portland, ME',
    miles: 170,
    minRate: 65000,
    maxRate: 90000,
    equipment: 'DRY_VAN',
    frequency: 'weekly',
  },
];
