import { Injectable, Logger } from '@nestjs/common';

/** Format equipment type for display */
function fmtEquipment(raw: string | null): string {
  if (!raw) return 'N/A';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a date-only field (appointmentDate) without timezone shift.
 * Parses the ISO date string to avoid locale-dependent Date constructor shifting.
 */
function fmtDateOnly(date: Date | string | null): string {
  if (!date) return 'N/A';
  const iso = date instanceof Date ? date.toISOString().split('T')[0] : String(date).split('T')[0];
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

/** Type for the dispatch sheet data returned by LoadLegService.getDispatchSheet() */
export interface DispatchSheetData {
  legId: string;
  legSequence: number;
  totalLegs: number;
  isFinalLeg: boolean;
  status: string;
  loadNumber: string;
  referenceNumber: string | null;
  customerName: string | null;
  commodityType: string;
  weightLbs: number;
  requiredEquipmentType?: string | null;
  specialRequirements: string | null;
  pieces: number | null;
  hazmatClass: string | null;
  tempRange: { minF: number | null; maxF: number | null } | null;
  driver: {
    driverId: string;
    name: string;
    phone: string | null;
  } | null;
  vehicle: {
    vehicleId: string;
    unitNumber: string;
    make: string | null;
    model: string | null;
  } | null;
  stops: Array<{
    sequence: number;
    actionType: string;
    facility: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    appointmentDate: Date | string | null;
    earliestArrival: string | null;
    latestArrival: string | null;
    dockHours: number | null;
    notes: string | null;
    contactName: string | null;
    contactPhone: string | null;
    bolNumber: string | null;
  }>;
  route: {
    planId: string;
    miles: number;
    driveTimeHours: number;
    departure: Date | string | null;
    eta: Date | string | null;
  } | null;
}

@Injectable()
export class DispatchSheetPdfService {
  private readonly logger = new Logger(DispatchSheetPdfService.name);

  async generatePdf(
    data: DispatchSheetData,
    companyName: string,
    companyMc?: string | null,
    companyDot?: string | null,
    companyPhone?: string | null,
    companyAddress?: string | null,
  ): Promise<Buffer> {
    const { default: PdfPrinter } = await import('pdfmake/js/Printer' as any);
    const path = await import('path');
    const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'build/fonts/Roboto');
    const printer = new PdfPrinter({
      Roboto: {
        normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
      },
    });

    // ── Company header info ──
    const companyInfo: string[] = [companyName];
    if (companyMc) companyInfo.push(`MC# ${companyMc}`);
    if (companyDot) companyInfo.push(`DOT# ${companyDot}`);
    if (companyAddress) companyInfo.push(companyAddress);
    if (companyPhone) companyInfo.push(companyPhone);

    // ── Build content ──
    const content: any[] = [];

    // Header row: company + DISPATCH SHEET title
    content.push({
      columns: [
        {
          stack: companyInfo.map((line, i) => ({
            text: line,
            fontSize: i === 0 ? 14 : 9,
            bold: i === 0,
            color: i === 0 ? '#000000' : '#666666',
            margin: [0, 0, 0, i === 0 ? 3 : 1] as [number, number, number, number],
          })),
          width: '*',
        },
        {
          stack: [
            {
              text: 'DISPATCH SHEET',
              fontSize: 20,
              bold: true,
              alignment: 'right',
              color: '#000000',
            },
            {
              text: `Load #${data.loadNumber}`,
              fontSize: 11,
              alignment: 'right',
              color: '#333333',
              margin: [0, 3, 0, 0] as [number, number, number, number],
            },
            ...(data.referenceNumber
              ? [
                  {
                    text: `PO/Ref: ${data.referenceNumber}`,
                    fontSize: 10,
                    alignment: 'right',
                    color: '#666666',
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
            ...(data.totalLegs > 1
              ? [
                  {
                    text: `Leg ${data.legSequence} of ${data.totalLegs}`,
                    fontSize: 9,
                    alignment: 'right',
                    color: '#666666',
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
          width: 'auto',
        },
      ],
      margin: [0, 0, 0, 16] as [number, number, number, number],
    });

    // ── Driver & Vehicle section ──
    const driverName = data.driver?.name ?? 'Unassigned';
    const driverPhone = data.driver?.phone ?? 'N/A';
    const vehicleUnit = data.vehicle?.unitNumber ?? 'N/A';
    const vehicleDesc = [data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(' ') || 'N/A';

    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              columns: [
                {
                  stack: [
                    {
                      text: 'DRIVER',
                      fontSize: 8,
                      bold: true,
                      color: '#999999',
                      margin: [0, 0, 0, 3] as [number, number, number, number],
                    },
                    {
                      text: driverName,
                      fontSize: 11,
                      bold: true,
                      color: '#000000',
                    },
                    { text: driverPhone, fontSize: 9, color: '#666666' },
                  ],
                  width: '*',
                },
                {
                  stack: [
                    {
                      text: 'VEHICLE',
                      fontSize: 8,
                      bold: true,
                      color: '#999999',
                      margin: [0, 0, 0, 3] as [number, number, number, number],
                    },
                    {
                      text: `Unit #${vehicleUnit}`,
                      fontSize: 11,
                      bold: true,
                      color: '#000000',
                    },
                    { text: vehicleDesc, fontSize: 9, color: '#666666' },
                  ],
                  width: '*',
                },
              ],
              margin: [8, 6, 8, 6] as [number, number, number, number],
              fillColor: '#f5f5f5',
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12] as [number, number, number, number],
    });

    // ── Load details section ──
    const detailRow = (label: string, value: string) => ({
      columns: [
        { text: `${label}:`, fontSize: 9, color: '#999999', width: 80 },
        { text: value, fontSize: 9, color: '#000000', width: 'auto' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    });

    const loadDetailsLeft: any[] = [
      detailRow('Customer', data.customerName ?? 'N/A'),
      ...(data.referenceNumber ? [detailRow('Reference #', data.referenceNumber)] : []),
      detailRow('Commodity', data.commodityType ?? 'N/A'),
      detailRow('Equipment', fmtEquipment(data.requiredEquipmentType)),
    ];

    const loadDetailsRight: any[] = [
      detailRow('Weight', data.weightLbs ? `${data.weightLbs.toLocaleString()} lbs` : 'N/A'),
      detailRow('Pieces', data.pieces?.toString() ?? 'N/A'),
      detailRow('Hazmat', data.hazmatClass ?? 'No'),
      ...(data.route?.miles ? [detailRow('Est. Miles', `${Math.round(data.route.miles).toLocaleString()} mi`)] : []),
    ];

    if (data.tempRange) {
      const tempParts: string[] = [];
      if (data.tempRange.minF != null) tempParts.push(`Min: ${data.tempRange.minF}\u00B0F`);
      if (data.tempRange.maxF != null) tempParts.push(`Max: ${data.tempRange.maxF}\u00B0F`);
      loadDetailsRight.push(detailRow('Temp', tempParts.join(' / ') || 'N/A'));
    }

    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'LOAD DETAILS',
                  fontSize: 8,
                  bold: true,
                  color: '#999999',
                  margin: [0, 0, 0, 4] as [number, number, number, number],
                },
                {
                  columns: [
                    { stack: loadDetailsLeft, width: '*' },
                    { stack: loadDetailsRight, width: '*' },
                  ],
                },
              ],
              margin: [8, 6, 8, 6] as [number, number, number, number],
              fillColor: '#f5f5f5',
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12] as [number, number, number, number],
    });

    // ── Stops section ──
    content.push({
      text: 'STOPS',
      fontSize: 10,
      bold: true,
      color: '#000000',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });

    for (const stop of data.stops) {
      const actionLabel = stop.actionType.toUpperCase();
      const facilityName = stop.facility ?? 'TBD';
      const addressParts = [stop.address, stop.city, stop.state, stop.zipCode].filter(Boolean);
      const addressLine = addressParts.length > 0 ? addressParts.join(', ') : 'Address not provided';

      const stopContent: any[] = [
        {
          columns: [
            {
              text: `${stop.sequence}.`,
              fontSize: 10,
              bold: true,
              width: 20,
              color: '#000000',
            },
            {
              text: `${actionLabel} — ${facilityName}`,
              fontSize: 10,
              bold: true,
              color: '#000000',
              width: '*',
            },
          ],
          margin: [0, 0, 0, 2] as [number, number, number, number],
        },
        {
          text: addressLine,
          fontSize: 9,
          color: '#666666',
          margin: [20, 0, 0, 2] as [number, number, number, number],
        },
      ];

      // Contact info — critical for driver to call ahead
      if (stop.contactName || stop.contactPhone) {
        const contactParts = [stop.contactName, stop.contactPhone].filter(Boolean);
        stopContent.push({
          text: `Contact: ${contactParts.join(' — ')}`,
          fontSize: 9,
          color: '#333333',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }

      if (stop.appointmentDate) {
        stopContent.push({
          text: `Appt: ${fmtDateOnly(stop.appointmentDate)}`,
          fontSize: 9,
          color: '#333333',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }
      if (stop.earliestArrival || stop.latestArrival) {
        const window = [stop.earliestArrival, stop.latestArrival].filter(Boolean).join(' \u2013 ');
        stopContent.push({
          text: `Window: ${window}`,
          fontSize: 9,
          color: '#333333',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }
      if (stop.dockHours) {
        stopContent.push({
          text: `Est. dock time: ${stop.dockHours}h`,
          fontSize: 9,
          color: '#333333',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }
      if (stop.bolNumber) {
        stopContent.push({
          text: `BOL#: ${stop.bolNumber}`,
          fontSize: 9,
          color: '#333333',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }
      if (stop.notes) {
        stopContent.push({
          text: `Notes: ${stop.notes}`,
          fontSize: 9,
          italics: true,
          color: '#666666',
          margin: [20, 0, 0, 1] as [number, number, number, number],
        });
      }

      content.push({
        stack: stopContent,
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    // ── Special requirements ──
    if (data.specialRequirements) {
      content.push({
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    text: 'SPECIAL REQUIREMENTS',
                    fontSize: 8,
                    bold: true,
                    color: '#999999',
                    margin: [0, 0, 0, 3] as [number, number, number, number],
                  },
                  {
                    text: data.specialRequirements,
                    fontSize: 9,
                    color: '#333333',
                  },
                ],
                margin: [8, 6, 8, 6] as [number, number, number, number],
                fillColor: '#f5f5f5',
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 0] as [number, number, number, number],
      });
    }

    // ── Dispatch contact ──
    if (companyPhone) {
      content.push({
        text: `Dispatch Contact: ${companyPhone}`,
        fontSize: 8,
        color: '#666666',
        margin: [0, 12, 0, 0] as [number, number, number, number],
      });
    }

    const docDefinition: any = {
      pageSize: 'LETTER' as const,
      pageMargins: [40, 40, 40, 50] as [number, number, number, number],
      content,
      footer: {
        columns: [
          {
            text: `Generated: ${new Date().toLocaleString('en-US')}`,
            fontSize: 7,
            color: '#cccccc',
            margin: [40, 0, 0, 0] as [number, number, number, number],
          },
          {
            text: 'Powered by SALLY',
            fontSize: 7,
            color: '#cccccc',
            alignment: 'right',
            margin: [0, 0, 40, 0] as [number, number, number, number],
          },
        ],
      },
      defaultStyle: { font: 'Roboto' },
    };

    // pdfmake 0.3.x returns a Promise<PDFDocument> — must await
    const pdf = await printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));

    return new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }
}
