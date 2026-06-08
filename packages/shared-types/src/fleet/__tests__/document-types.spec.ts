import {
  DOCUMENT_TYPES,
  getDocumentTypesForEntity,
  getDocumentTypeLabel,
  getDocumentTypeConfig,
  getDocumentTypeIcon,
  getAllDocumentTypeCodes,
  getComplianceDocumentTypes,
  type DocumentTypeCode,
  type DocumentTypeConfig,
} from '../document-types';

const ALL_CODES: DocumentTypeCode[] = [
  'rate_confirmation',
  'bol',
  'pod',
  'lumper_receipt',
  'scale_ticket',
  'cdl',
  'medical_card',
  'mvr',
  'drug_test',
  'employment_app',
  'training_cert',
  'registration',
  'inspection_report',
  'lease_agreement',
  'permit',
  'insurance_cert',
  'photo',
  'other',
];

const VALID_ENFORCEMENT_KEYS = [
  'bolEnforcement',
  'podEnforcement',
  'rateConEnforcement',
  'lumperReceiptEnforcement',
  'scaleTicketEnforcement',
];

describe('Document Types Registry', () => {
  describe('DOCUMENT_TYPES const', () => {
    it('has exactly 18 document types', () => {
      expect(Object.keys(DOCUMENT_TYPES)).toHaveLength(18);
    });

    it('contains all expected type codes', () => {
      const codes = Object.keys(DOCUMENT_TYPES);
      for (const code of ALL_CODES) {
        expect(codes).toContain(code);
      }
    });

    it('every entry has all required fields', () => {
      for (const [code, config] of Object.entries(DOCUMENT_TYPES)) {
        expect(config.label).toBeDefined();
        expect(typeof config.label).toBe('string');
        expect(config.label.length).toBeGreaterThan(0);

        expect(config.description).toBeDefined();
        expect(typeof config.description).toBe('string');

        expect(config.entityTypes).toBeDefined();
        expect(Array.isArray(config.entityTypes)).toBe(true);
        expect(config.entityTypes.length).toBeGreaterThan(0);

        expect(typeof config.isPerStop).toBe('boolean');
        expect(typeof config.defaultEnforcement).toBe('string');
        expect(typeof config.icon).toBe('string');
        expect(config.icon.length).toBeGreaterThan(0);
      }
    });

    it('per-stop types have stopActionType', () => {
      for (const [code, config] of Object.entries(DOCUMENT_TYPES)) {
        if (config.isPerStop) {
          expect(config.stopActionType).toBeDefined();
          expect(['pickup', 'delivery']).toContain(config.stopActionType);
        }
      }
    });

    it('bol is per-stop with pickup action', () => {
      expect(DOCUMENT_TYPES.bol.isPerStop).toBe(true);
      expect(DOCUMENT_TYPES.bol.stopActionType).toBe('pickup');
    });

    it('pod is per-stop with delivery action', () => {
      expect(DOCUMENT_TYPES.pod.isPerStop).toBe(true);
      expect(DOCUMENT_TYPES.pod.stopActionType).toBe('delivery');
    });

    it('types with enforcementSettingsKey map to valid keys', () => {
      for (const [code, config] of Object.entries(DOCUMENT_TYPES) as [string, DocumentTypeConfig][]) {
        if (config.enforcementSettingsKey) {
          expect(VALID_ENFORCEMENT_KEYS).toContain(config.enforcementSettingsKey);
        }
      }
    });

    it('exactly 5 types have enforcementSettingsKey', () => {
      const withKey = (Object.values(DOCUMENT_TYPES) as DocumentTypeConfig[]).filter((c) => c.enforcementSettingsKey);
      expect(withKey).toHaveLength(5);
    });
  });

  describe('getDocumentTypesForEntity', () => {
    it('returns correct load types', () => {
      const loadTypes = getDocumentTypesForEntity('load');
      const loadCodes = loadTypes.map((t) => t.value);

      expect(loadCodes).toContain('rate_confirmation');
      expect(loadCodes).toContain('bol');
      expect(loadCodes).toContain('pod');
      expect(loadCodes).toContain('photo');
      expect(loadCodes).toContain('other');
      expect(loadCodes).not.toContain('cdl');
      expect(loadCodes).not.toContain('registration');
    });

    it('returns correct driver types', () => {
      const driverTypes = getDocumentTypesForEntity('driver');
      const driverCodes = driverTypes.map((t) => t.value);

      expect(driverCodes).toContain('cdl');
      expect(driverCodes).toContain('insurance_cert');
      expect(driverCodes).toContain('medical_card');
      expect(driverCodes).toContain('photo');
      expect(driverCodes).not.toContain('bol');
      expect(driverCodes).not.toContain('registration');
    });

    it('returns correct vehicle types', () => {
      const vehicleTypes = getDocumentTypesForEntity('vehicle');
      const vehicleCodes = vehicleTypes.map((t) => t.value);

      expect(vehicleCodes).toContain('registration');
      expect(vehicleCodes).toContain('insurance_cert');
      expect(vehicleCodes).toContain('inspection_report');
      expect(vehicleCodes).toContain('photo');
      expect(vehicleCodes).not.toContain('bol');
      expect(vehicleCodes).not.toContain('cdl');
    });

    it('returns { value, label } pairs', () => {
      const types = getDocumentTypesForEntity('load');
      for (const t of types) {
        expect(t).toHaveProperty('value');
        expect(t).toHaveProperty('label');
        expect(typeof t.value).toBe('string');
        expect(typeof t.label).toBe('string');
      }
    });
  });

  describe('getDocumentTypeLabel', () => {
    it('returns label for known types', () => {
      expect(getDocumentTypeLabel('bol')).toBe('Bill of Lading');
      expect(getDocumentTypeLabel('pod')).toBe('Proof of Delivery');
      expect(getDocumentTypeLabel('cdl')).toBe('CDL Copy');
    });

    it('returns formatted code for unknown types', () => {
      expect(getDocumentTypeLabel('some_unknown_type')).toBe('Some Unknown Type');
    });
  });

  describe('getDocumentTypeConfig', () => {
    it('returns config for known types', () => {
      const config = getDocumentTypeConfig('rate_confirmation');
      expect(config).toBeDefined();
      expect(config!.label).toBe('Rate Confirmation');
      expect(config!.enforcementSettingsKey).toBe('rateConEnforcement');
    });

    it('returns undefined for unknown types', () => {
      expect(getDocumentTypeConfig('nonexistent')).toBeUndefined();
    });
  });

  describe('getDocumentTypeIcon', () => {
    it('returns icon for known types', () => {
      expect(getDocumentTypeIcon('bol')).toBe('file-text');
      expect(getDocumentTypeIcon('photo')).toBe('image');
      expect(getDocumentTypeIcon('other')).toBe('file');
    });

    it('returns "file" for unknown types', () => {
      expect(getDocumentTypeIcon('nonexistent')).toBe('file');
    });
  });

  describe('getAllDocumentTypeCodes', () => {
    it('returns all 18 codes', () => {
      const codes = getAllDocumentTypeCodes();
      expect(codes).toHaveLength(18);
      for (const code of ALL_CODES) {
        expect(codes).toContain(code);
      }
    });
  });

  describe('getComplianceDocumentTypes', () => {
    it('excludes photo and other for load entity', () => {
      const compliance = getComplianceDocumentTypes('load');
      const codes = compliance.map(([code]) => code);

      expect(codes).not.toContain('photo');
      expect(codes).not.toContain('other');
    });

    it('includes all 5 load compliance types', () => {
      const compliance = getComplianceDocumentTypes('load');
      const codes = compliance.map(([code]) => code);

      expect(codes).toContain('rate_confirmation');
      expect(codes).toContain('bol');
      expect(codes).toContain('pod');
      expect(codes).toContain('lumper_receipt');
      expect(codes).toContain('scale_ticket');
      expect(codes).toHaveLength(5);
    });

    it('returns driver compliance types without utilities', () => {
      const compliance = getComplianceDocumentTypes('driver');
      const codes = compliance.map(([code]) => code);

      expect(codes).toContain('cdl');
      expect(codes).toContain('insurance_cert');
      expect(codes).not.toContain('photo');
      expect(codes).not.toContain('other');
    });

    it('returns vehicle compliance types without utilities', () => {
      const compliance = getComplianceDocumentTypes('vehicle');
      const codes = compliance.map(([code]) => code);

      expect(codes).toContain('registration');
      expect(codes).toContain('insurance_cert');
      expect(codes).not.toContain('photo');
      expect(codes).not.toContain('other');
    });

    it('returns [code, config] tuples', () => {
      const compliance = getComplianceDocumentTypes('load');
      for (const [code, config] of compliance) {
        expect(typeof code).toBe('string');
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('entityTypes');
      }
    });
  });
});
