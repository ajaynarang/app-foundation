import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

function fmt(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cell(text: string, opts?: Record<string, any>) {
  return { text, ...opts };
}

const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  FUEL_ADVANCE: 'Fuel Advance',
  CASH_ADVANCE: 'Cash Advance',
  INSURANCE: 'Insurance',
  EQUIPMENT_LEASE: 'Equipment Lease',
  ESCROW: 'Escrow',
  OTHER: 'Other',
};

const PAY_TYPE_LABELS: Record<string, string> = {
  PER_MILE: 'Per Mile',
  PERCENTAGE: 'Percentage',
  FLAT_RATE: 'Flat Rate',
  HYBRID: 'Hybrid',
};

@Injectable()
export class SettlementPdfService {
  private readonly logger = new Logger(SettlementPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(tenantId: number, settlementId: string): Promise<Buffer> {
    const settlement = await this.prisma.settlement.findFirst({
      where: { settlementId, tenantId },
      include: {
        driver: {
          include: { payStructures: { where: { isActive: true }, take: 1 } },
        },
        lineItems: {
          include: {
            load: {
              select: {
                loadNumber: true,
                stops: {
                  include: { stop: true },
                  orderBy: { sequenceOrder: 'asc' },
                },
              },
            },
          },
        },
        deductions: true,
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

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
    const driver = settlement.driver as any;
    const ps = driver?.payStructures?.[0] ?? null;

    // Company header lines
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

    // Format pay rate
    let payRateStr = '';
    if (ps) {
      switch (ps.type) {
        case 'PER_MILE':
          payRateStr = `$${((ps.ratePerMileCents ?? 0) / 100).toFixed(2)}/mile`;
          break;
        case 'PERCENTAGE':
          payRateStr = `${Number(ps.percentage ?? 0)}% of revenue`;
          break;
        case 'FLAT_RATE':
          payRateStr = `$${((ps.flatRateCents ?? 0) / 100).toFixed(2)}/load`;
          break;
        case 'HYBRID':
          payRateStr = `$${((ps.hybridBaseCents ?? 0) / 100).toFixed(2)} base + ${Number(ps.hybridPercent ?? 0)}%`;
          break;
      }
    }

    // Build route labels from load stops
    const formatRoute = (load: any): string => {
      if (!load?.stops?.length) return 'N/A';
      const origin = load.stops[0]?.stop;
      const dest = load.stops[load.stops.length - 1]?.stop;
      const oLabel = [origin?.city, origin?.state].filter(Boolean).join(', ') || 'N/A';
      const dLabel = [dest?.city, dest?.state].filter(Boolean).join(', ') || 'N/A';
      return `${oLabel} → ${dLabel}`;
    };

    // --- Earnings table ---
    const headerStyle = {
      bold: true,
      fontSize: 9,
      fillColor: '#333333',
      color: '#ffffff',
    };
    const earningsHeader = [
      cell('Load #', headerStyle),
      cell('Route', headerStyle),
      cell('Miles', { ...headerStyle, alignment: 'right' }),
      cell('Revenue', { ...headerStyle, alignment: 'right' }),
      cell('Pay', { ...headerStyle, alignment: 'right' }),
    ];

    const earningsRows = settlement.lineItems.map((li: any) => [
      cell(li.load?.loadNumber ?? `#${li.loadId}`, { fontSize: 9 }),
      cell(formatRoute(li.load), { fontSize: 9 }),
      cell(li.miles?.toFixed(0) ?? '—', { fontSize: 9, alignment: 'right' }),
      cell(li.loadRevenueCents ? fmt(li.loadRevenueCents) : '—', {
        fontSize: 9,
        alignment: 'right',
      }),
      cell(fmt(li.payAmountCents), { fontSize: 9, alignment: 'right' }),
    ]);

    const noBorder = [false, false, false, false];
    earningsRows.push([
      cell('', { border: noBorder }),
      cell('', { border: noBorder }),
      cell('', { border: noBorder }),
      cell('Subtotal', {
        fontSize: 9,
        bold: true,
        alignment: 'right',
        border: noBorder,
      }),
      cell(fmt(settlement.grossPayCents), {
        fontSize: 9,
        bold: true,
        alignment: 'right',
        border: noBorder,
      }),
    ]);

    const tableLayout = {
      hLineWidth: (i: number, node: any) => (i <= 1 || i === node.table.body.length ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => '#e0e0e0',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    };

    // --- Deductions table (if any) ---
    const deductionContent: any[] = [];
    if (settlement.deductions.length > 0) {
      const dedHeader = [
        cell('Type', headerStyle),
        cell('Description', headerStyle),
        cell('Amount', { ...headerStyle, alignment: 'right' }),
      ];

      const dedRows = settlement.deductions.map((d: any) => [
        cell(DEDUCTION_TYPE_LABELS[d.type] || d.type, { fontSize: 9 }),
        cell(d.description, { fontSize: 9 }),
        cell(`-${fmt(d.amountCents)}`, {
          fontSize: 9,
          alignment: 'right',
          color: '#cc0000',
        }),
      ]);

      dedRows.push([
        cell('', { border: noBorder }),
        cell('Total Deductions', {
          fontSize: 9,
          bold: true,
          alignment: 'right',
          border: noBorder,
        }),
        cell(`-${fmt(settlement.deductionsCents)}`, {
          fontSize: 9,
          bold: true,
          alignment: 'right',
          color: '#cc0000',
          border: noBorder,
        }),
      ]);

      deductionContent.push(
        {
          text: 'DEDUCTIONS',
          fontSize: 10,
          bold: true,
          color: '#333333',
          margin: [0, 15, 0, 6] as [number, number, number, number],
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [dedHeader, ...dedRows],
          },
          layout: tableLayout,
        },
      );
    }

    // --- Net pay summary ---
    const netPayBody = [
      [
        cell('Gross Pay', {
          alignment: 'right',
          fontSize: 10,
          border: noBorder,
        }),
        cell(fmt(settlement.grossPayCents), {
          alignment: 'right',
          fontSize: 10,
          border: noBorder,
        }),
      ],
      [
        cell('Deductions', {
          alignment: 'right',
          fontSize: 10,
          border: noBorder,
        }),
        cell(`-${fmt(settlement.deductionsCents)}`, {
          alignment: 'right',
          fontSize: 10,
          color: '#cc0000',
          border: noBorder,
        }),
      ],
      [
        cell('NET PAY', {
          alignment: 'right',
          fontSize: 14,
          bold: true,
          border: noBorder,
        }),
        cell(fmt(settlement.netPayCents), {
          alignment: 'right',
          fontSize: 14,
          bold: true,
          border: noBorder,
        }),
      ],
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
                text: 'SETTLEMENT',
                fontSize: 22,
                bold: true,
                alignment: 'right',
                color: '#000000',
              },
              {
                text: 'STATEMENT',
                fontSize: 14,
                alignment: 'right',
                color: '#666666',
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: settlement.settlementNumber,
                fontSize: 11,
                alignment: 'right',
                color: '#333333',
              },
            ],
            width: 'auto',
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Driver info and settlement details side by side
      {
        columns: [
          {
            stack: [
              {
                text: 'DRIVER',
                fontSize: 9,
                bold: true,
                color: '#999999',
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: driver?.name ?? 'Unknown',
                fontSize: 11,
                bold: true,
                color: '#000000',
                margin: [0, 0, 0, 1] as [number, number, number, number],
              },
              {
                text: `Pay Type: ${PAY_TYPE_LABELS[ps?.type] ?? 'N/A'}`,
                fontSize: 9,
                color: '#666666',
                margin: [0, 0, 0, 1] as [number, number, number, number],
              },
              ...(payRateStr
                ? [
                    {
                      text: `Rate: ${payRateStr}`,
                      fontSize: 9,
                      color: '#666666',
                      margin: [0, 0, 0, 1] as [number, number, number, number],
                    },
                  ]
                : []),
            ],
            width: '*',
          },
          {
            stack: [
              {
                text: 'SETTLEMENT DETAILS',
                fontSize: 9,
                bold: true,
                color: '#999999',
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              this.detailRow(
                'Period',
                `${new Date(settlement.periodStart).toLocaleDateString('en-US')} – ${new Date(settlement.periodEnd).toLocaleDateString('en-US')}`,
              ),
              this.detailRow('Status', settlement.status),
              ...(settlement.approvedAt
                ? [this.detailRow('Approved', new Date(settlement.approvedAt).toLocaleDateString('en-US'))]
                : []),
              ...(settlement.paidAt
                ? [this.detailRow('Paid', new Date(settlement.paidAt).toLocaleDateString('en-US'))]
                : []),
              this.detailRow('Loads', `${settlement.lineItems.length}`),
            ],
            width: 'auto',
          },
        ],
        margin: [0, 0, 0, 15] as [number, number, number, number],
      },

      // Earnings table
      {
        text: 'EARNINGS',
        fontSize: 10,
        bold: true,
        color: '#333333',
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [earningsHeader, ...earningsRows],
        },
        layout: tableLayout,
      },

      // Deductions (conditional)
      ...deductionContent,

      // Net pay summary
      { text: ' ', fontSize: 8 },
      {
        columns: [
          { text: '', width: '*' },
          {
            width: 250,
            table: { widths: ['*', 'auto'], body: netPayBody },
            layout: 'noBorders',
          },
        ],
        margin: [0, 10, 0, 0] as [number, number, number, number],
      },

      // Notes (if any)
      ...(settlement.notes
        ? [
            {
              text: 'NOTES',
              fontSize: 9,
              bold: true,
              color: '#999999',
              margin: [0, 20, 0, 4] as [number, number, number, number],
            },
            { text: settlement.notes, fontSize: 9, color: '#333333' },
          ]
        : []),
    ];

    const docDefinition: any = {
      pageSize: 'LETTER' as const,
      pageMargins: [40, 40, 40, 60] as [number, number, number, number],
      content,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: 'Generated by SALLY',
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
      defaultStyle: { font: 'Roboto' },
    };

    const pdf = await printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));

    return new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
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
