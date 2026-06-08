/**
 * Unified Mock Dataset — Single Source of Truth
 *
 * All mock entity data lives here. Every adapter and service that needs mock data
 * imports from this file instead of maintaining its own inline data.
 *
 * DRIVERS and VEHICLES: Auto-generated from Samsara API via:
 *   pnpm run sync-mock
 *
 * LOADS: Hand-crafted Boston/NY corridor loads (edit manually).
 *
 * Last synced: 2026-02-15T06:59:04.846Z
 */

import type { DriverData, VehicleData } from '../../domains/integrations/adapters/tms/tms-adapter.interface';

// ---------------------------------------------------------------------------
// Mock TMS Drivers (synced from Samsara — 19 drivers)
//
// These use the same phone numbers, license numbers, and names as real
// Samsara drivers so ELD sync can match them correctly.
// ---------------------------------------------------------------------------

export const MOCK_TMS_DRIVERS: DriverData[] = [
  {
    driver_id: 'TMS-DRV-001',
    first_name: 'Heideckel',
    last_name: 'Toribo ( Oscar)',
    phone: '9788856169',
    email: 'heideckel.oscar)@carrier.com',
    license_number: 'NHL14227039',
    license_state: 'NH',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53207939
  },
  {
    driver_id: 'TMS-DRV-002',
    first_name: 'Deepak',
    last_name: 'NFN',
    phone: '3477654208',
    email: 'deepak.nfn@carrier.com',
    license_number: '149147333',
    license_state: 'NY',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53208817
  },
  {
    driver_id: 'TMS-DRV-003',
    first_name: 'James',
    last_name: 'Austin',
    phone: '3393644162',
    email: 'james.austin@carrier.com',
    license_number: 'S62067934',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53211426
  },
  {
    driver_id: 'TMS-DRV-004',
    first_name: 'Eric',
    last_name: 'Driver',
    phone: '9786050448',
    email: 'eric@carrier.com',
    license_number: 'S10910231',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53250543
  },
  {
    driver_id: 'TMS-DRV-005',
    first_name: 'NUNEZ',
    last_name: 'ROBERT',
    phone: '19783059716',
    email: 'nunez.robert@carrier.com',
    license_number: 'S06599536',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53708172
  },
  {
    driver_id: 'TMS-DRV-006',
    first_name: 'Camaron',
    last_name: 'Donald Edeard',
    phone: '16178325411',
    email: 'camaron.edeard@carrier.com',
    license_number: 'S55592723',
    license_state: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53759537
  },
  {
    driver_id: 'TMS-DRV-007',
    first_name: 'Antoine',
    last_name: 'R',
    phone: '9082205786',
    email: 'antoine.r@carrier.com',
    license_number: 'NHL11816663',
    license_state: 'NH',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53761629
  },
  {
    driver_id: 'TMS-DRV-008',
    first_name: 'Manveer',
    last_name: 'Driver',
    phone: '4752069690',
    email: 'manveer@carrier.com',
    license_number: '199414960',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53878141
  },
  {
    driver_id: 'TMS-DRV-009',
    first_name: 'Ahamed',
    last_name: 'Mohamed Faizal',
    phone: '',
    email: 'ahamed.faizal@carrier.com',
    license_number: 'S67168726',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 53958253
  },
  {
    driver_id: 'TMS-DRV-010',
    first_name: 'Hector',
    last_name: 'Joel Batista',
    phone: '9783139100',
    email: 'hector.batista@carrier.com',
    license_number: 'SA0180947',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 54172938
  },
  {
    driver_id: 'TMS-DRV-011',
    first_name: 'David',
    last_name: 'Arden',
    phone: '2038415054',
    email: 'david.arden@carrier.com',
    license_number: '108736005',
    license_state: 'CT',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 54290438
  },
  {
    driver_id: 'TMS-DRV-012',
    first_name: 'Dhozhi',
    last_name: 'Rei',
    phone: '7815210573',
    email: 'dhozhi.rei@carrier.com',
    license_number: 'SA8640372',
    license_state: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 54561137
  },
  {
    driver_id: 'TMS-DRV-013',
    first_name: 'Winder',
    last_name: 'Joshua James, JR',
    phone: '',
    email: 'winder.jr@carrier.com',
    license_number: '129251687',
    license_state: 'CT',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 54624756
  },
  {
    driver_id: 'TMS-DRV-014',
    first_name: 'JAY',
    last_name: 'Driver',
    phone: '3392081659',
    email: 'jay@carrier.com',
    license_number: '123',
    license_state: 'MA',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 54980150
  },
  {
    driver_id: 'TMS-DRV-015',
    first_name: 'Anand',
    last_name: 'Rituraj',
    phone: '',
    email: 'anand.rituraj@carrier.com',
    license_number: '',
    license_state: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 55058900
  },
  {
    driver_id: 'TMS-DRV-016',
    first_name: 'Brinder',
    last_name: 'Singh',
    phone: '19296230454',
    email: 'brinder.singh@carrier.com',
    license_number: '440586911',
    license_state: 'NY',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 55163240
  },
  {
    driver_id: 'TMS-DRV-017',
    first_name: 'Michael',
    last_name: 'Driver',
    phone: '14753844854',
    email: 'michael@carrier.com',
    license_number: '178339822',
    license_state: 'CT',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 55257455
  },
  {
    driver_id: 'TMS-DRV-018',
    first_name: 'Fresly',
    last_name: 'Driver',
    phone: '',
    email: 'fresly@carrier.com',
    license_number: '',
    license_state: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 55369119
  },
  {
    driver_id: 'TMS-DRV-019',
    first_name: 'Dinero',
    last_name: 'Driver',
    phone: '',
    email: 'dinero@carrier.com',
    license_number: '',
    license_state: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 55430354
  },
];

// ---------------------------------------------------------------------------
// Mock TMS Vehicles (synced from Samsara — 20 vehicles)
//
// These use the same VINs and license plates as real Samsara vehicles
// so ELD sync can match them correctly.
// ---------------------------------------------------------------------------

export const MOCK_TMS_VEHICLES: VehicleData[] = [
  {
    vehicle_id: 'TMS-VEH-001',
    unit_number: 'TRK-001',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGHDV9JLJY8062',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387574
  },
  {
    vehicle_id: 'TMS-VEH-002',
    unit_number: 'TRK-002',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2019,
    vin: '3AKJHPDV2KSKA4482',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387575
  },
  {
    vehicle_id: 'TMS-VEH-003',
    unit_number: 'TRK-003',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2019,
    vin: '3AKJHPDV8KSKF9518',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387576
  },
  {
    vehicle_id: 'TMS-VEH-004',
    unit_number: 'TRK-004',
    make: 'VOLVO TRUCK',
    model: 'VNL',
    year: 2016,
    vin: '4V4NC9EHXGN946995',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387577
  },
  {
    vehicle_id: 'TMS-VEH-005',
    unit_number: 'TRK-005',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGHDV8JLJY8070',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387578
  },
  {
    vehicle_id: 'TMS-VEH-006',
    unit_number: 'TRK-006',
    make: 'VOLVO TRUCK',
    model: 'VNL',
    year: 2018,
    vin: '4V4NC9EH9JN996004',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387579
  },
  {
    vehicle_id: 'TMS-VEH-007',
    unit_number: 'TRK-007',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2020,
    vin: '3AKJHPDV6LSLG8996',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387580
  },
  {
    vehicle_id: 'TMS-VEH-008',
    unit_number: 'TRK-008',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2013,
    vin: '3AKJGLDV3DSFF7928',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387581
  },
  {
    vehicle_id: 'TMS-VEH-009',
    unit_number: 'TRK-009',
    make: 'VOLVO TRUCK',
    model: 'VNL',
    year: 2017,
    vin: '4V4NC9EH2HN978972',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387582
  },
  {
    vehicle_id: 'TMS-VEH-010',
    unit_number: 'TRK-010',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGHDV7JLJY8061',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387584
  },
  {
    vehicle_id: 'TMS-VEH-011',
    unit_number: 'TRK-011',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2020,
    vin: '3AKJHPDV1LSLF0275',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387585
  },
  {
    vehicle_id: 'TMS-VEH-012',
    unit_number: 'TRK-012',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2019,
    vin: '3AKJHHDR3KSKD1196',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387586
  },
  {
    vehicle_id: 'TMS-VEH-013',
    unit_number: 'TRK-013',
    make: 'VOLVO TRUCK',
    model: 'VNL',
    year: 2017,
    vin: '4V4NC9EH0HN979036',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387600
  },
  {
    vehicle_id: 'TMS-VEH-014',
    unit_number: 'TRK-014',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGLDV3JLJY8030',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996387601
  },
  {
    vehicle_id: 'TMS-VEH-015',
    unit_number: 'TRK-015',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGHDV8JLJY8070',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474996685865
  },
  {
    vehicle_id: 'TMS-VEH-016',
    unit_number: 'TRK-016',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGLDV8JLJY8024',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474998591916
  },
  {
    vehicle_id: 'TMS-VEH-017',
    unit_number: 'TRK-017',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGHDVXJLJY8071',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474998647326
  },
  {
    vehicle_id: 'TMS-VEH-018',
    unit_number: 'TRK-018',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGLDV1JLKC7015',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281474998739425
  },
  {
    vehicle_id: 'TMS-VEH-019',
    unit_number: 'TRK-019',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGLDV2JLKC6973',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281475000143401
  },
  {
    vehicle_id: 'TMS-VEH-020',
    unit_number: 'TRK-020',
    make: 'FREIGHTLINER',
    model: 'CASCADIA',
    year: 2018,
    vin: '1FUJGLDV8JLKC6976',
    license_plate: '',
    status: 'ACTIVE' as const,
    data_source: 'mock_tms',
    // Samsara ID: 281475000143402
  },
];
