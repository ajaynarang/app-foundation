import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

function fmt(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cell(text: string, opts?: Record<string, any>) {
  return { text, ...opts };
}

interface TenantInfo {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  mcNumber: string;
  dotNumber: string;
}

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: number, reportType: string, title: string, data: Record<string, any>[]): Promise<string> {
    const tenantInfo = await this.getTenantInfo(tenantId);
    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Tenant header rows
    const headerLines: string[] = [
      tenantInfo.companyName,
      ...(tenantInfo.address ? [tenantInfo.address] : []),
      [tenantInfo.phone, tenantInfo.email].filter(Boolean).join(' | '),
      [
        tenantInfo.mcNumber ? `MC# ${tenantInfo.mcNumber}` : '',
        tenantInfo.dotNumber ? `DOT# ${tenantInfo.dotNumber}` : '',
      ]
        .filter(Boolean)
        .join('  '),
      '',
      `Report: ${title}`,
      `Generated: ${timestamp}`,
      '',
    ].filter((line) => line !== undefined);

    if (!data || data.length === 0) {
      return headerLines.join('\n') + '\nNo data available';
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          let str = String(val);
          if (/^[=+\-@\t\r]/.test(str)) {
            str = `'${str}`;
          }
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    );

    return [...headerLines, headers.join(','), ...rows].join('\n');
  }

  async exportPdf(
    tenantId: number,
    reportType: string,
    title: string,
    data: Record<string, any>[],
    columns: { key: string; label: string; format?: string }[],
  ): Promise<Buffer> {
    const tenantInfo = await this.getTenantInfo(tenantId);

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

    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Company info lines for header
    const companyLines: string[] = [
      tenantInfo.companyName,
      tenantInfo.address,
      [tenantInfo.phone, tenantInfo.email].filter(Boolean).join(' | '),
      [
        tenantInfo.mcNumber ? `MC# ${tenantInfo.mcNumber}` : '',
        tenantInfo.dotNumber ? `DOT# ${tenantInfo.dotNumber}` : '',
      ]
        .filter(Boolean)
        .join('  '),
    ].filter(Boolean);

    // Table header row
    const headerRow = columns.map((col) =>
      cell(col.label, {
        bold: true,
        fontSize: 8,
        color: '#333333',
        fillColor: '#f5f5f5',
      }),
    );

    // Table data rows
    const dataRows = data.slice(0, 200).map((row) =>
      columns.map((col) => {
        const val = row[col.key];
        let display = val === null || val === undefined ? '' : String(val);
        if (col.format === 'currency' && typeof val === 'number') {
          display = fmt(val);
        } else if (col.format === 'percent' && typeof val === 'number') {
          display = `${val.toFixed(1)}%`;
        } else if (col.format === 'number' && typeof val === 'number') {
          display = val.toLocaleString();
        }
        return cell(display, { fontSize: 8 });
      }),
    );

    const widths = columns.map(() => '*');

    const content: any[] = [
      // Company header + report title
      {
        columns: [
          {
            stack: companyLines.map((line, i) => ({
              text: line,
              fontSize: i === 0 ? 14 : 8,
              bold: i === 0,
              color: i === 0 ? '#000000' : '#666666',
              margin: [0, 0, 0, i === 0 ? 3 : 1] as [number, number, number, number],
            })),
            width: '*',
          },
          {
            stack: [
              {
                text: title.toUpperCase(),
                fontSize: 14,
                bold: true,
                alignment: 'right',
                color: '#000000',
              },
              {
                text: `Generated: ${timestamp}`,
                fontSize: 8,
                alignment: 'right',
                color: '#999999',
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ],
            width: 'auto',
          },
        ],
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },

      // Divider line
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 535,
            y2: 0,
            lineWidth: 0.5,
            lineColor: '#e0e0e0',
          },
        ],
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },

      // Data table
      {
        table: {
          headerRows: 1,
          widths,
          body: [headerRow, ...dataRows],
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i <= 1 || i === node.table.body.length ? 0.5 : 0),
          vLineWidth: () => 0,
          hLineColor: () => '#e0e0e0',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },

      // Row count
      {
        text: `${data.length} rows${data.length > 200 ? ' (showing first 200)' : ''}`,
        fontSize: 7,
        color: '#999999',
        margin: [0, 8, 0, 0] as [number, number, number, number],
      },
    ];

    const docDefinition: any = {
      pageSize: 'LETTER' as const,
      pageOrientation: columns.length > 5 ? 'landscape' : 'portrait',
      pageMargins: [30, 30, 30, 50] as [number, number, number, number],
      content,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `${tenantInfo.companyName} — Powered by SALLY`,
            fontSize: 7,
            color: '#cccccc',
            margin: [30, 0, 0, 0] as [number, number, number, number],
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            fontSize: 7,
            color: '#cccccc',
            alignment: 'right',
            margin: [0, 0, 30, 0] as [number, number, number, number],
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

  private async getTenantInfo(tenantId: number): Promise<TenantInfo> {
    const settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
      select: {
        companyLegalName: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
        email: true,
        mcNumber: true,
        dotNumber: true,
      },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true },
    });

    const addr = settings
      ? [settings.address, settings.city, settings.state, settings.zip].filter(Boolean).join(', ')
      : '';

    return {
      companyName: settings?.companyLegalName || tenant?.companyName || 'Company',
      address: addr,
      phone: settings?.phone || '',
      email: settings?.email || '',
      mcNumber: settings?.mcNumber || '',
      dotNumber: settings?.dotNumber || '',
    };
  }
}
