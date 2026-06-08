// ── User Modes ──
export type UserMode =
  | 'prospect'
  | 'dispatcher'
  | 'driver'
  | 'owner'
  | 'admin'
  | 'super_admin'
  | 'customer'
  | 'support';

// ── Orb States ──
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Input Mode ──
export type InputMode = 'voice' | 'text';

// ── Chat Layout ──
export type ChatLayout = 'side' | 'split' | 'full' | 'float';

// ── Intent names by mode ──
export type ProspectIntent = 'product_info' | 'pricing' | 'integration' | 'demo_request' | 'lead_capture' | 'general';

export type DispatcherIntent =
  | 'alert_query'
  | 'alert_ack'
  | 'driver_lookup'
  | 'route_query'
  | 'hos_check'
  | 'fleet_status'
  | 'add_note'
  | 'flag_driver'
  | 'general';

export type DriverIntent =
  | 'route_status'
  | 'hos_status'
  | 'eta_query'
  | 'delay_report'
  | 'arrival_report'
  | 'fuel_stop_report'
  | 'weather_query'
  | 'general';

export type Intent = ProspectIntent | DispatcherIntent | DriverIntent;

// ── Rich Cards ──
export type RichCardType =
  // Existing
  | 'alert'
  | 'alert_list'
  | 'driver'
  | 'route'
  | 'hos'
  | 'fleet'
  | 'lead_form'
  | 'confirmation'
  // Invoicing
  | 'invoice'
  | 'invoice_list'
  | 'invoice_summary'
  // Settlements
  | 'settlement'
  | 'settlement_list'
  | 'settlement_summary'
  // Customers
  | 'customer'
  | 'customer_list'
  // Shield
  | 'shield'
  | 'shield_findings'
  // Documents
  | 'doc_compliance'
  | 'doc_upload'
  // Fleet detail
  | 'driver_detail'
  | 'driver_list'
  | 'vehicle_detail'
  | 'vehicle_list'
  | 'load_detail'
  // Help
  | 'capabilities'
  // Reports
  | 'report_download';

export interface RichCard {
  type: RichCardType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

// ── Card Data Shapes ──────────────────────────────────────

export interface InvoiceCardData {
  id: string;
  number: string;
  status: string;
  customerName: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string;
  issueDate: string;
  lineItemCount: number;
}

export interface InvoiceListCardData {
  invoices: InvoiceCardData[];
  totalCount: number;
}

export interface InvoiceSummaryCardData {
  totalOutstandingCents: number;
  overdueCount: number;
  agingBuckets: {
    currentCents: number;
    thirtyDayCents: number;
    sixtyDayCents: number;
    ninetyPlusCents: number;
  };
  countByStatus: Record<string, number>;
}

export interface SettlementCardData {
  id: string;
  number: string;
  status: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  grossPayCents: number;
  deductionsCents: number;
  netPayCents: number;
  lineItemCount: number;
}

export interface SettlementListCardData {
  settlements: SettlementCardData[];
  totalCount: number;
}

export interface SettlementSummaryCardData {
  pendingTotalCents: number;
  approvedTotalCents: number;
  paidTotalCents: number;
  countByStatus: Record<string, number>;
}

export interface CustomerCardData {
  id: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string;
  isActive: boolean;
  totalInvoicedCents?: number;
  outstandingCents?: number;
}

export interface CustomerListCardData {
  customers: CustomerCardData[];
  totalCount: number;
}

export interface ShieldCardData {
  overallScore: number;
  hosScore: number;
  driversScore: number;
  vehiclesScore: number;
  loadsScore: number;
  statusLabel: string;
  lastAuditAt: string;
}

export interface ShieldFindingsCardData {
  findings: Array<{
    severity: string;
    title: string;
    entityName?: string;
    recommendation?: string;
  }>;
  totalCount: number;
}

export interface DocComplianceCardData {
  complianceScore: number;
  hasBlockers: boolean;
  requirements: Array<{
    documentType: string;
    status: string;
    reason: string;
    dueBy?: string;
  }>;
}

export interface DocUploadCardData {
  entityType: 'load';
  entityId: number | string;
  loadId: string;
  loadNumber: string;
  documentType: string;
  documentTypeLabel: string;
  existingCount: number;
}

export interface DriverDetailCardData {
  driverId: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  licenseState?: string;
  cdlClass?: string;
  endorsements?: string[];
  hireDate?: string;
  medicalCardExpiry?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  assignedVehicle?: string | null;
  notes?: string;
}

export interface DriverListCardData {
  drivers: Array<{
    driverId: string;
    name: string;
    status: string;
    phone?: string;
    assignedVehicle?: string | null;
  }>;
  totalCount: number;
}

export interface VehicleDetailCardData {
  vehicleId: string;
  unitNumber: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  equipmentType: string;
  status: string;
  fuelCapacityGallons?: number;
  currentFuelGallons?: number;
  odometerMiles?: number;
  licensePlate?: string;
  licensePlateState?: string;
  assignedDriver?: string | null;
}

export interface VehicleListCardData {
  vehicles: Array<{
    vehicleId: string;
    unitNumber: string;
    equipmentType: string;
    status: string;
    assignedDriver?: string | null;
    currentFuelGallons?: number;
    fuelCapacityGallons?: number;
  }>;
  totalCount: number;
}

export interface LoadDetailCardData {
  loadId: string;
  loadNumber: string;
  status: string;
  customerName?: string;
  rateDollars?: string;
  weightLbs?: number;
  commodityType?: string;
  equipmentType?: string;
  referenceNumber?: string;
  driver?: string;
  vehicle?: string;
  stops: Array<{
    type: string;
    facility: string;
    location: string;
    sequence: number;
    status?: string;
  }>;
  documentCount?: number;
  noteCount?: number;
  pickupDate?: string;
  deliveryDate?: string;
}

export interface ConfirmationCardData {
  action: string;
  description: string;
  entityId?: string;
  entityType?: string;
}

// ── Action Results ──
export interface ActionResult {
  type: string;
  success: boolean;
  message: string;
}

// ── Sally Response ──
export interface SallyResponse {
  text: string;
  card?: RichCard;
  followUp?: string;
  action?: ActionResult;
  speakText?: string;
}

// ── Chat Message ──
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputMode: InputMode;
  timestamp: Date;
  intent?: Intent;
  card?: RichCard;
  action?: ActionResult;
  speakText?: string;
}

// ── Lead Data ──
export interface LeadData {
  name?: string;
  email?: string;
  fleetSize?: string;
}

// ── Mock Data Types ──
export interface MockDriver {
  id: string;
  name: string;
  status: 'driving' | 'at_dock' | 'resting' | 'off_duty';
  hosRemaining: number;
  vehicle: string;
  currentRoute: string | null;
}

export interface MockAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  driver: string | null;
  vehicle?: string;
  message: string;
  route: string;
}

export interface MockRoute {
  id: string;
  origin: string;
  destination: string;
  stops: number;
  eta: string;
  status: 'in_progress' | 'planned' | 'completed';
  driver: string | null;
}

export interface MockFleet {
  activeVehicles: number;
  activeRoutes: number;
  pendingAlerts: number;
  driversAvailable: number;
  driversDriving: number;
  driversResting: number;
}
