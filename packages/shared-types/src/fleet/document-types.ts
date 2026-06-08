export type DocumentEntityType = 'load' | 'driver' | 'vehicle';
export type EnforcementLevel = 'required' | 'recommended' | 'when_applicable' | 'not_required';
export type StopActionType = 'pickup' | 'delivery';

export interface DocumentTypeConfig {
  readonly label: string;
  readonly description: string;
  readonly entityTypes: readonly DocumentEntityType[];
  readonly isPerStop: boolean;
  readonly stopActionType?: StopActionType;
  readonly defaultEnforcement: EnforcementLevel;
  readonly enforcementSettingsKey?: string;
  /** For `when_applicable` docs: the charge type that makes this doc applicable */
  readonly applicableChargeType?: string;
  readonly isUtility?: boolean;
  readonly icon: string;
}

export const DOCUMENT_TYPES = {
  // ── Load documents ──
  rate_confirmation: {
    label: 'Rate Confirmation',
    description: 'Load-level document confirming the agreed rate.',
    entityTypes: ['load'],
    isPerStop: false,
    defaultEnforcement: 'recommended',
    enforcementSettingsKey: 'rateConEnforcement',
    icon: 'receipt',
  },
  bol: {
    label: 'Bill of Lading',
    description: 'Required per completed pickup stop.',
    entityTypes: ['load'],
    isPerStop: true,
    stopActionType: 'pickup',
    defaultEnforcement: 'required',
    enforcementSettingsKey: 'bolEnforcement',
    icon: 'file-text',
  },
  pod: {
    label: 'Proof of Delivery',
    description: 'Required per completed delivery stop. Tracked with grace period.',
    entityTypes: ['load'],
    isPerStop: true,
    stopActionType: 'delivery',
    defaultEnforcement: 'required',
    enforcementSettingsKey: 'podEnforcement',
    icon: 'file-text',
  },
  lumper_receipt: {
    label: 'Lumper Receipt',
    description: 'Receipt for unloading services paid by the driver.',
    entityTypes: ['load'],
    isPerStop: false,
    defaultEnforcement: 'when_applicable',
    enforcementSettingsKey: 'lumperReceiptEnforcement',
    applicableChargeType: 'lumper',
    icon: 'receipt',
  },
  scale_ticket: {
    label: 'Scale Ticket',
    description: 'Weight verification document for the load.',
    entityTypes: ['load'],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    enforcementSettingsKey: 'scaleTicketEnforcement',
    icon: 'scale',
  },
  fuel_receipt: {
    label: 'Fuel Receipt',
    description: 'Fuel purchase receipt for IFTA reporting.',
    // IFTA document type — not linked to the standard load/driver/vehicle entity
    // flow. entityTypes is empty so it does not appear in per-entity document pickers.
    entityTypes: [],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    icon: 'receipt',
  },

  // ── Driver documents ──
  cdl: {
    label: 'CDL Copy',
    description: "Commercial Driver's License copy.",
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'required',
    icon: 'id-card',
  },
  medical_card: {
    label: 'Medical Card',
    description: "DOT medical examiner's certificate.",
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'required',
    icon: 'heart-pulse',
  },
  mvr: {
    label: 'Motor Vehicle Record',
    description: 'Driving history report.',
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'recommended',
    icon: 'file-text',
  },
  drug_test: {
    label: 'Drug & Alcohol Test',
    description: 'DOT drug and alcohol test results.',
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'required',
    icon: 'flask-conical',
  },
  employment_app: {
    label: 'Employment Application',
    description: 'Driver employment application form.',
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'recommended',
    icon: 'clipboard-list',
  },
  training_cert: {
    label: 'Training Certificate',
    description: 'Safety or skills training completion certificate.',
    entityTypes: ['driver'],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    icon: 'award',
  },

  // ── Vehicle documents ──
  registration: {
    label: 'Vehicle Registration',
    description: 'State vehicle registration document.',
    entityTypes: ['vehicle'],
    isPerStop: false,
    defaultEnforcement: 'required',
    icon: 'file-text',
  },
  inspection_report: {
    label: 'Inspection Report',
    description: 'Vehicle inspection report.',
    entityTypes: ['vehicle'],
    isPerStop: false,
    defaultEnforcement: 'recommended',
    icon: 'clipboard-check',
  },
  lease_agreement: {
    label: 'Lease Agreement',
    description: 'Vehicle lease or rental agreement.',
    entityTypes: ['vehicle'],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    icon: 'file-signature',
  },
  permit: {
    label: 'Operating Permit',
    description: 'Operating authority or oversize/overweight permit.',
    entityTypes: ['vehicle'],
    isPerStop: false,
    defaultEnforcement: 'recommended',
    icon: 'badge-check',
  },

  // ── Shared documents ──
  insurance_cert: {
    label: 'Insurance Certificate',
    description: 'Certificate of insurance.',
    entityTypes: ['driver', 'vehicle'],
    isPerStop: false,
    defaultEnforcement: 'required',
    icon: 'shield-check',
  },
  photo: {
    label: 'Photo',
    description: 'General photo documentation.',
    entityTypes: ['load', 'driver', 'vehicle'],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    isUtility: true,
    icon: 'image',
  },
  other: {
    label: 'Other',
    description: 'Miscellaneous document.',
    entityTypes: ['load', 'driver', 'vehicle'],
    isPerStop: false,
    defaultEnforcement: 'not_required',
    isUtility: true,
    icon: 'file',
  },
} as const satisfies Record<string, DocumentTypeConfig>;

export type DocumentTypeCode = keyof typeof DOCUMENT_TYPES;

// ── Helper functions ──

/**
 * Returns `{ value, label }` pairs for a given entity type, suitable for dropdowns.
 */
export function getDocumentTypesForEntity(entityType: DocumentEntityType): { value: string; label: string }[] {
  const entries = Object.entries(DOCUMENT_TYPES) as [string, DocumentTypeConfig][];
  return entries
    .filter(([, config]) => config.entityTypes.includes(entityType))
    .map(([code, config]) => ({ value: code, label: config.label }));
}

/**
 * Returns the human-readable label for a document type code.
 * Falls back to title-cased code for unknown types.
 */
export function getDocumentTypeLabel(code: string): string {
  const config = (DOCUMENT_TYPES as Record<string, DocumentTypeConfig>)[code];
  if (config) return config.label;
  return code
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Returns the full config for a document type code, or undefined if unknown.
 */
export function getDocumentTypeConfig(code: string): DocumentTypeConfig | undefined {
  return (DOCUMENT_TYPES as Record<string, DocumentTypeConfig>)[code];
}

/**
 * Returns the icon name for a document type code. Falls back to 'file'.
 */
export function getDocumentTypeIcon(code: string): string {
  const config = (DOCUMENT_TYPES as Record<string, DocumentTypeConfig>)[code];
  return config?.icon ?? 'file';
}

/**
 * Returns all document type codes.
 */
export function getAllDocumentTypeCodes(): DocumentTypeCode[] {
  return Object.keys(DOCUMENT_TYPES) as DocumentTypeCode[];
}

/**
 * Returns `[code, config]` tuples for compliance-relevant document types,
 * excluding utility types (photo, other).
 */
export function getComplianceDocumentTypes(entityType: DocumentEntityType): [DocumentTypeCode, DocumentTypeConfig][] {
  const entries = Object.entries(DOCUMENT_TYPES) as [DocumentTypeCode, DocumentTypeConfig][];
  return entries.filter(([, config]) => config.entityTypes.includes(entityType) && !config.isUtility);
}
