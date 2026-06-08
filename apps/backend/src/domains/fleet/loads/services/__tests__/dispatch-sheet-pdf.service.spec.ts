import { DispatchSheetPdfService, DispatchSheetData } from '../dispatch-sheet-pdf.service';

const baseData: DispatchSheetData = {
  legId: 'LEG-001',
  legSequence: 1,
  totalLegs: 1,
  isFinalLeg: true,
  status: 'ASSIGNED',
  loadNumber: 'LN-00123',
  referenceNumber: 'REF-98765',
  customerName: 'ABC Logistics',
  commodityType: 'Electronics',
  weightLbs: 42000,
  requiredEquipmentType: 'DRY_VAN',
  specialRequirements: 'Must use load locks',
  pieces: 24,
  hazmatClass: null,
  tempRange: null,
  driver: {
    driverId: 'DRV-001',
    name: 'John Smith',
    phone: '555-123-4567',
  },
  vehicle: {
    vehicleId: 'VEH-001',
    unitNumber: '4521',
    make: 'Freightliner',
    model: 'Cascadia',
  },
  stops: [
    {
      sequence: 1,
      actionType: 'pickup',
      facility: 'ABC Warehouse',
      address: '123 Industrial Blvd',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      appointmentDate: '2026-04-08',
      earliestArrival: '08:00',
      latestArrival: '10:00',
      dockHours: 2,
      notes: 'Dock 12, check in at guard gate',
      contactName: 'Jane Doe',
      contactPhone: '555-987-6543',
      bolNumber: 'BOL-12345',
    },
    {
      sequence: 2,
      actionType: 'delivery',
      facility: 'XYZ Distribution',
      address: '456 Commerce Dr',
      city: 'Memphis',
      state: 'TN',
      zipCode: '38101',
      appointmentDate: '2026-04-09',
      earliestArrival: null,
      latestArrival: null,
      dockHours: 1.5,
      notes: null,
      contactName: 'Bob Wilson',
      contactPhone: '555-456-7890',
      bolNumber: null,
    },
  ],
  route: {
    planId: 'RP-001',
    miles: 530,
    driveTimeHours: 8.5,
    departure: null,
    eta: null,
  },
};

/**
 * Recursively extract all text strings from a pdfmake document definition.
 * Walks content arrays, stacks, columns, table bodies, and text nodes.
 */
function extractTexts(node: any): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(extractTexts);

  const texts: string[] = [];
  if (typeof node.text === 'string') texts.push(node.text);
  if (Array.isArray(node.text)) texts.push(...node.text.flatMap(extractTexts));
  if (node.content) texts.push(...extractTexts(node.content));
  if (node.stack) texts.push(...extractTexts(node.stack));
  if (node.columns) texts.push(...extractTexts(node.columns));
  if (node.table?.body) {
    for (const row of node.table.body) {
      texts.push(...extractTexts(row));
    }
  }
  return texts;
}

describe('DispatchSheetPdfService', () => {
  let service: DispatchSheetPdfService;

  beforeEach(() => {
    service = new DispatchSheetPdfService();
  });

  /**
   * Helper: intercept the doc definition passed to pdfmake by wrapping generatePdf.
   * We import pdfmake ourselves, spy on createPdfKitDocument, call generatePdf,
   * and return both the PDF buffer and the captured doc definition.
   */
  async function generateAndCapture(
    data: DispatchSheetData,
    companyName: string,
    companyMc?: string | null,
    companyDot?: string | null,
    companyPhone?: string | null,
    companyAddress?: string | null,
  ): Promise<{ buffer: Buffer; docDef: any; allTexts: string[] }> {
    // We spy on the printer by wrapping the service method.
    // Since the service dynamically imports pdfmake, we capture the doc def
    // by monkey-patching the module temporarily.
    let capturedDocDef: any = null;

    const origGenerate = service.generatePdf.bind(service);

    // Proxy approach: override generatePdf to intercept the doc definition
    // by importing pdfmake and wrapping the printer
    const PdfPrinter = (await import('pdfmake/js/Printer' as any)).default;
    const origCreate = PdfPrinter.prototype.createPdfKitDocument;
    PdfPrinter.prototype.createPdfKitDocument = function (docDef: any, ...args: any[]) {
      capturedDocDef = docDef;
      return origCreate.call(this, docDef, ...args);
    };

    try {
      const buffer = await origGenerate(data, companyName, companyMc, companyDot, companyPhone, companyAddress);
      const allTexts = capturedDocDef ? extractTexts(capturedDocDef.content) : [];
      return { buffer, docDef: capturedDocDef, allTexts };
    } finally {
      PdfPrinter.prototype.createPdfKitDocument = origCreate;
    }
  }

  describe('generatePdf() — PDF validity', () => {
    it('should return a Buffer', async () => {
      const result = await service.generatePdf(baseData, 'Test Carrier LLC');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should return a valid PDF (starts with %PDF magic bytes)', async () => {
      const result = await service.generatePdf(baseData, 'Test Carrier LLC');
      const header = result.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should produce a non-trivial PDF size', async () => {
      const result = await service.generatePdf(baseData, 'Test Carrier LLC');
      // A valid PDF with content should be at least a few KB
      expect(result.length).toBeGreaterThan(1000);
    });
  });

  describe('generatePdf() — content via doc definition', () => {
    it('should include company name', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Acme Trucking Inc');
      expect(allTexts.join(' ')).toContain('Acme Trucking Inc');
    });

    it('should include load number', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('LN-00123');
    });

    it('should include DISPATCH SHEET title', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts).toContain('DISPATCH SHEET');
    });

    it('should include driver name and phone', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('John Smith');
      expect(joined).toContain('555-123-4567');
    });

    it('should include vehicle unit number', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('4521');
    });

    it('should include stop facility names', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('ABC Warehouse');
      expect(joined).toContain('XYZ Distribution');
    });

    it('should include stop addresses', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('123 Industrial Blvd');
      expect(joined).toContain('Chicago');
    });

    it('should include contact info when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('Jane Doe');
      expect(joined).toContain('555-987-6543');
    });

    it('should include BOL number when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('BOL-12345');
    });

    it('should include dock hours when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('2h');
      expect(joined).toContain('1.5h');
    });

    it('should include special requirements', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('Must use load locks');
    });

    it('should include reference number when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('REF-98765');
    });

    it('should format equipment type correctly (DRY_VAN -> DRY VAN)', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts).toContain('DRY VAN');
    });

    it('should include MC# and DOT# when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier', 'MC123456', 'DOT789');
      const joined = allTexts.join(' ');
      expect(joined).toContain('MC# MC123456');
      expect(joined).toContain('DOT# DOT789');
    });

    it('should include company phone when provided', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier', null, null, '800-555-0000');
      expect(allTexts.join(' ')).toContain('800-555-0000');
    });

    it('should include company address when provided', async () => {
      const { allTexts } = await generateAndCapture(
        baseData,
        'Test Carrier',
        null,
        null,
        null,
        '100 Main St, Dallas, TX',
      );
      expect(allTexts.join(' ')).toContain('100 Main St, Dallas, TX');
    });

    it('should show "Leg X of Y" only when totalLegs > 1', async () => {
      const multiLegData: DispatchSheetData = {
        ...baseData,
        legSequence: 2,
        totalLegs: 3,
      };
      const { allTexts } = await generateAndCapture(multiLegData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('Leg 2 of 3');
    });

    it('should NOT show leg info when totalLegs is 1', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).not.toContain('Leg 1 of 1');
    });

    it('should show temperature range when tempRange is provided', async () => {
      const tempData: DispatchSheetData = {
        ...baseData,
        tempRange: { minF: 34, maxF: 38 },
      };
      const { allTexts } = await generateAndCapture(tempData, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('34');
      expect(joined).toContain('38');
    });

    it('should include stop notes when present', async () => {
      const { allTexts } = await generateAndCapture(baseData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('Dock 12, check in at guard gate');
    });

    it('should handle appointmentDate as Date object', async () => {
      const dateObjData: DispatchSheetData = {
        ...baseData,
        stops: [
          {
            ...baseData.stops[0],
            appointmentDate: new Date('2026-04-08T00:00:00Z'),
          },
        ],
      };
      const { allTexts } = await generateAndCapture(dateObjData, 'Test Carrier');
      expect(allTexts.join(' ')).toContain('Apr 8, 2026');
    });
  });

  describe('generatePdf() — null/missing optional fields', () => {
    it('should handle null driver gracefully (shows Unassigned)', async () => {
      const noDriver: DispatchSheetData = { ...baseData, driver: null };
      const { buffer, allTexts } = await generateAndCapture(noDriver, 'Test Carrier');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(allTexts).toContain('Unassigned');
    });

    it('should handle null vehicle gracefully', async () => {
      const noVehicle: DispatchSheetData = { ...baseData, vehicle: null };
      const result = await service.generatePdf(noVehicle, 'Test Carrier');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle null route gracefully', async () => {
      const noRoute: DispatchSheetData = { ...baseData, route: null };
      const result = await service.generatePdf(noRoute, 'Test Carrier');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle no special requirements gracefully', async () => {
      const noReqs: DispatchSheetData = {
        ...baseData,
        specialRequirements: null,
      };
      const { allTexts } = await generateAndCapture(noReqs, 'Test Carrier');
      expect(allTexts).not.toContain('SPECIAL REQUIREMENTS');
    });

    it('should handle null referenceNumber gracefully', async () => {
      const noRef: DispatchSheetData = {
        ...baseData,
        referenceNumber: null,
      };
      const result = await service.generatePdf(noRef, 'Test Carrier');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle null requiredEquipmentType gracefully (shows N/A)', async () => {
      const noEquip: DispatchSheetData = {
        ...baseData,
        requiredEquipmentType: null,
      };
      const { allTexts } = await generateAndCapture(noEquip, 'Test Carrier');
      expect(allTexts).toContain('N/A');
    });

    it('should handle empty stops array', async () => {
      const noStops: DispatchSheetData = { ...baseData, stops: [] };
      const result = await service.generatePdf(noStops, 'Test Carrier');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle stop with all null optional fields', async () => {
      const minimalStop: DispatchSheetData = {
        ...baseData,
        stops: [
          {
            sequence: 1,
            actionType: 'pickup',
            facility: null,
            address: null,
            city: null,
            state: null,
            zipCode: null,
            appointmentDate: null,
            earliestArrival: null,
            latestArrival: null,
            dockHours: null,
            notes: null,
            contactName: null,
            contactPhone: null,
            bolNumber: null,
          },
        ],
      };
      const { allTexts } = await generateAndCapture(minimalStop, 'Test Carrier');
      const joined = allTexts.join(' ');
      expect(joined).toContain('TBD');
      expect(joined).toContain('Address not provided');
    });
  });
});
