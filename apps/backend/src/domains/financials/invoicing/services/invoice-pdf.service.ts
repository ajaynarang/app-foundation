import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const LINE_ITEM_TYPE_LABELS: Record<string, string> = {
  LINEHAUL: 'Linehaul',
  FUEL_SURCHARGE: 'Fuel Surcharge',
  DETENTION_PICKUP: 'Detention (Pickup)',
  DETENTION_DELIVERY: 'Detention (Delivery)',
  LAYOVER: 'Layover',
  LUMPER: 'Lumper',
  TONU: 'TONU',
  ACCESSORIAL: 'Accessorial',
  ADJUSTMENT: 'Adjustment',
};

function fmt(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Create a text cell for pdfmake. Every cell MUST have a text property. */
function cell(text: string, opts?: Record<string, any>) {
  return { text, ...opts };
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(tenantId: number, invoiceNumber: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: {
        customer: {
          include: {
            contacts: {
              where: { isPrimary: true, status: 'ACTIVE' },
              take: 1,
            },
          },
        },
        load: {
          include: {
            stops: {
              include: { stop: true },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
        lineItems: { orderBy: { sequenceOrder: 'asc' } },
        payments: { orderBy: { paymentDate: 'asc' } },
        factoringCompanyRel: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Cast load to any to access all fields (Prisma narrows type with include)
    const load = invoice.load as any;

    const settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
    });

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

    const companyName = settings?.companyLegalName || 'Company Name';

    // Build stop labels — handle null city/state gracefully
    const formatStop = (loadStop: any) => {
      if (!loadStop?.stop) return 'N/A';
      const parts = [loadStop.stop.city, loadStop.stop.state].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : 'N/A';
    };
    const origin = load?.stops?.[0];
    const destination = load?.stops?.[load.stops.length - 1];
    const originLabel = formatStop(origin);
    const destLabel = formatStop(destination);

    // Pickup / delivery dates from first and last stop
    const pickupDate = origin?.completedAt || origin?.arrivedAt || origin?.appointmentDate;
    const deliveryDate = destination?.completedAt || destination?.arrivedAt || destination?.appointmentDate;

    // Build company header info
    const companyInfo: string[] = [companyName];
    if (settings?.mcNumber) companyInfo.push(`MC# ${settings.mcNumber}`);
    if (settings?.dotNumber) companyInfo.push(`DOT# ${settings.dotNumber}`);
    if (settings?.address) {
      const addrParts = [settings.address];
      if (settings.city) addrParts.push(settings.city);
      if (settings.state) addrParts.push(settings.state);
      if (settings.zip) addrParts.push(settings.zip);
      companyInfo.push(addrParts.join(', '));
    }
    if (settings?.phone) companyInfo.push(settings.phone);
    if (settings?.email) companyInfo.push(settings.email);

    // Build bill-to
    const customer = invoice.customer;
    const billToLines: string[] = [customer.companyName];
    // Billing address: prefer dedicated billing fields, fall back to general
    const billingAddrParts = [
      customer.billingAddress || customer.address,
      [customer.billingCity || customer.city, customer.billingState || customer.state].filter(Boolean).join(', '),
      customer.billingZip,
    ].filter(Boolean);
    if (billingAddrParts.length > 0) billToLines.push(...billingAddrParts);
    const primaryContact = customer.contacts?.[0];
    const billingEmail = customer.billingEmail || primaryContact?.email;
    if (billingEmail) billToLines.push(billingEmail);

    // --- Line items table rows ---
    const headerRow = [
      cell('Type', {
        bold: true,
        fontSize: 9,
        fillColor: '#333333',
        color: '#ffffff',
      }),
      cell('Description', {
        bold: true,
        fontSize: 9,
        fillColor: '#333333',
        color: '#ffffff',
      }),
      cell('Qty', {
        bold: true,
        fontSize: 9,
        fillColor: '#333333',
        color: '#ffffff',
        alignment: 'center',
      }),
      cell('Unit Price', {
        bold: true,
        fontSize: 9,
        fillColor: '#333333',
        color: '#ffffff',
        alignment: 'right',
      }),
      cell('Total', {
        bold: true,
        fontSize: 9,
        fillColor: '#333333',
        color: '#ffffff',
        alignment: 'right',
      }),
    ];

    const dataRows = invoice.lineItems.map((li) => [
      cell(LINE_ITEM_TYPE_LABELS[li.type] || li.type, { fontSize: 9 }),
      cell(li.description || '', { fontSize: 9 }),
      cell(li.quantity.toString(), { fontSize: 9, alignment: 'center' }),
      cell(fmt(li.unitPriceCents), { fontSize: 9, alignment: 'right' }),
      cell(fmt(li.totalCents), { fontSize: 9, alignment: 'right' }),
    ]);

    // Totals section (simple 2-column table below, no colSpan complexity)
    const totalsContent: any[] = [
      { text: ' ', fontSize: 4 }, // spacer
      {
        columns: [
          { text: '', width: '*' },
          {
            width: 250,
            table: {
              widths: ['*', 'auto'],
              body: this.buildTotalsBody(invoice),
            },
            layout: 'noBorders',
          },
        ],
      },
    ];

    const content: any[] = [
      // Company header
      {
        columns: [
          {
            stack: companyInfo.map((line, i) => ({
              text: line,
              fontSize: i === 0 ? 16 : 9,
              bold: i === 0,
              color: i === 0 ? '#000000' : '#666666',
              margin: [0, 0, 0, i === 0 ? 4 : 1] as [number, number, number, number],
            })),
            width: '*',
          },
          {
            stack: [
              {
                text: 'INVOICE',
                fontSize: 24,
                bold: true,
                alignment: 'right',
                color: '#000000',
              },
              {
                text: invoice.invoiceNumber,
                fontSize: 12,
                alignment: 'right',
                color: '#333333',
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ],
            width: 'auto',
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Invoice info and Bill To side by side
      {
        columns: [
          {
            stack: [
              {
                text: 'BILL TO',
                fontSize: 9,
                bold: true,
                color: '#999999',
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              ...billToLines.map((line, i) => ({
                text: line,
                fontSize: i === 0 ? 11 : 9,
                bold: i === 0,
                color: i === 0 ? '#000000' : '#666666',
                margin: [0, 0, 0, 1] as [number, number, number, number],
              })),
            ],
            width: '*',
          },
          {
            stack: [
              {
                text: 'INVOICE DETAILS',
                fontSize: 9,
                bold: true,
                color: '#999999',
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              this.detailRow('Issue Date', this.formatDateOnly(invoice.issueDate)),
              this.detailRow('Due Date', this.formatDateOnly(invoice.dueDate)),
              this.detailRow('Terms', invoice.paymentTermsDays === 0 ? 'COD' : `Net ${invoice.paymentTermsDays} days`),
              this.detailRow('Status', invoice.status),
            ],
            width: 'auto',
          },
        ],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },

      // Load / shipment details
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    text: 'SHIPMENT DETAILS',
                    fontSize: 8,
                    bold: true,
                    color: '#999999',
                    margin: [0, 0, 0, 4] as [number, number, number, number],
                  },
                  {
                    columns: [
                      {
                        stack: [
                          ...(load?.loadNumber ? [this.detailRow('Load #', load.loadNumber)] : []),
                          ...(load?.referenceNumber ? [this.detailRow('Reference #', load.referenceNumber)] : []),
                          ...(load?.bolNumber ? [this.detailRow('BOL #', load.bolNumber)] : []),
                          ...(load?.requiredEquipmentType
                            ? [this.detailRow('Equipment', (load.requiredEquipmentType as string).replace(/_/g, ' '))]
                            : []),
                        ],
                        width: '*',
                      },
                      {
                        stack: [
                          this.detailRow('Origin', originLabel),
                          this.detailRow('Destination', destLabel),
                          ...(pickupDate
                            ? [this.detailRow('Pickup', new Date(pickupDate).toLocaleDateString('en-US'))]
                            : []),
                          ...(deliveryDate
                            ? [this.detailRow('Delivery', new Date(deliveryDate).toLocaleDateString('en-US'))]
                            : []),
                        ],
                        width: '*',
                      },
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
        margin: [0, 0, 0, 15] as [number, number, number, number],
      },

      // Line items table (data rows only, no totals mixed in)
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [headerRow, ...dataRows],
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i <= 1 || i === node.table.body.length ? 0.5 : 0),
          vLineWidth: () => 0,
          hLineColor: () => '#e0e0e0',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },

      // Totals (separate simple 2-col table, right-aligned)
      ...totalsContent,
    ];

    // Remit To / Payment instructions
    // When billing path is FACTORED and factoring company has a remittance address, use it
    const invoiceAny = invoice as any;
    const factoringCompanyRel = invoiceAny.factoringCompanyRel;
    const useFactorRemit = invoiceAny.billingPath === 'FACTORED' && factoringCompanyRel?.remittanceAddress;

    if (useFactorRemit) {
      content.push({
        stack: [
          {
            text: 'REMIT TO (FACTORING COMPANY)',
            fontSize: 9,
            bold: true,
            color: '#999999',
            margin: [0, 15, 0, 4] as [number, number, number, number],
          },
          {
            text: factoringCompanyRel.companyName,
            fontSize: 10,
            bold: true,
            color: '#333333',
            margin: [0, 0, 0, 2] as [number, number, number, number],
          },
          {
            text: factoringCompanyRel.remittanceAddress,
            fontSize: 9,
            color: '#333333',
          },
        ],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    } else if (settings?.remittanceInstructions) {
      content.push({
        stack: [
          {
            text: 'REMIT TO / PAYMENT INSTRUCTIONS',
            fontSize: 9,
            bold: true,
            color: '#999999',
            margin: [0, 15, 0, 4] as [number, number, number, number],
          },
          {
            text: settings.remittanceInstructions,
            fontSize: 9,
            color: '#333333',
          },
        ],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    // Reference invoice note (always shown)
    content.push({
      text: `Please reference invoice ${invoice.invoiceNumber} on all payments and correspondence.`,
      fontSize: 8,
      italics: true,
      color: '#666666',
      margin: [0, 8, 0, 10] as [number, number, number, number],
    });

    // Terms and conditions
    if (settings?.termsAndConditions) {
      content.push({
        stack: [
          {
            text: 'TERMS & CONDITIONS',
            fontSize: 8,
            bold: true,
            color: '#999999',
            margin: [0, 0, 0, 4] as [number, number, number, number],
          },
          { text: settings.termsAndConditions, fontSize: 7, color: '#999999' },
        ],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    const docDefinition: any = {
      pageSize: 'LETTER' as const,
      pageMargins: [40, 40, 40, 60] as [number, number, number, number],
      content,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: 'Powered by SALLY',
            fontSize: 7,
            color: '#cccccc',
            margin: [40, 0, 0, 0] as [number, number, number, number],
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            fontSize: 7,
            color: '#cccccc',
            alignment: 'right',
            margin: [0, 0, 40, 0] as [number, number, number, number],
          },
        ],
      }),
      defaultStyle: {
        font: 'Roboto',
      },
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

  /** Build a simple 2-column totals body for the right-aligned totals table. */
  private buildTotalsBody(invoice: any): any[][] {
    const noBorder = [false, false, false, false];
    const rows: any[][] = [];

    rows.push([
      cell('Subtotal', { alignment: 'right', fontSize: 9, border: noBorder }),
      cell(fmt(invoice.subtotalCents), {
        alignment: 'right',
        fontSize: 9,
        border: noBorder,
      }),
    ]);

    if (invoice.adjustmentCents !== 0) {
      rows.push([
        cell('Adjustments', {
          alignment: 'right',
          fontSize: 9,
          border: noBorder,
        }),
        cell(fmt(invoice.adjustmentCents), {
          alignment: 'right',
          fontSize: 9,
          border: noBorder,
        }),
      ]);
    }

    rows.push([
      cell('TOTAL DUE', {
        alignment: 'right',
        fontSize: 12,
        bold: true,
        border: noBorder,
      }),
      cell(fmt(invoice.totalCents), {
        alignment: 'right',
        fontSize: 12,
        bold: true,
        border: noBorder,
      }),
    ]);

    if (invoice.paidCents > 0) {
      rows.push([
        cell('Paid', { alignment: 'right', fontSize: 9, border: noBorder }),
        cell(`(${fmt(invoice.paidCents)})`, {
          alignment: 'right',
          fontSize: 9,
          border: noBorder,
        }),
      ]);
      rows.push([
        cell('Balance Due', {
          alignment: 'right',
          fontSize: 9,
          bold: true,
          border: noBorder,
        }),
        cell(fmt(invoice.balanceCents), {
          alignment: 'right',
          fontSize: 9,
          bold: true,
          border: noBorder,
        }),
      ]);
    }

    return rows;
  }

  /**
   * Format a @db.Date field for display without timezone shift.
   * Parses the ISO date string to avoid locale-dependent Date constructor shifting.
   */
  private formatDateOnly(date: Date | string): string {
    const iso = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
    const [y, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
  }

  private detailRow(label: string, value: string) {
    return {
      columns: [
        { text: `${label}:`, fontSize: 9, color: '#999999', width: 70 },
        { text: value, fontSize: 9, color: '#000000', width: 'auto' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    };
  }
}
