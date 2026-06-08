import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { ReportExportService } from '../../../analytics/services/report-export.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Custom Report MCP Tool — lets Sally AI generate ad-hoc reports on demand.
 *
 * Sally gathers data using existing query tools (query-loads, query-invoices, etc.),
 * then calls generate-custom-report with the structured data to produce a downloadable
 * CSV or PDF file with tenant branding.
 *
 * Tenant-scoped via `_tenantId` injected by McpToolService.
 */
@Injectable()
export class ReportTool {
  private readonly logger = new Logger(ReportTool.name);

  constructor(private readonly reportExportService: ReportExportService) {}

  @RequiresScope('invoices:read')
  @Tool({
    name: 'generate-custom-report',
    description:
      'Generate a custom CSV or PDF report from structured data. Use this AFTER gathering data with other query tools. ' +
      'Provide a title, column definitions (key + label + optional format), and row data. ' +
      'The report will include tenant branding (company name, address, MC/DOT numbers). ' +
      'Returns the report content as text (CSV) or a base64-encoded PDF. ' +
      'Example flow: 1) Use query-loads to get data, 2) Use generate-custom-report to format it as a downloadable report.',
    parameters: z.object({
      title: z.string().describe('Report title (e.g., "Loads with Detention Over 2 Hours")'),
      format: z.enum(['csv', 'pdf']).default('csv').describe('Output format: csv or pdf'),
      columns: z
        .array(
          z.object({
            key: z.string().describe('Field key matching the data object properties'),
            label: z.string().describe('Human-readable column header'),
            format: z
              .enum(['text', 'currency', 'percent', 'number', 'date'])
              .optional()
              .describe('Formatting hint: currency formats cents as $X.XX, percent adds %'),
          }),
        )
        .min(1)
        .describe('Column definitions for the report table'),
      rows: z
        .array(z.record(z.unknown()))
        .describe(
          'Array of row objects. Each object should have keys matching column definitions. ' +
            'Currency values should be in cents (integers). Percent values as numbers (e.g., 85.5 for 85.5%).',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async generateCustomReport({
    title,
    format,
    columns,
    rows,
    _tenantId,
  }: {
    title: string;
    format: 'csv' | 'pdf';
    columns: { key: string; label: string; format?: string }[];
    rows: Record<string, unknown>[];
    _tenantId?: number;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Session error: no tenant context.',
            }),
          },
        ],
      };
    }

    if (rows.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No data to generate report.' }),
          },
        ],
      };
    }

    this.logger.log(`Generating custom ${format} report: "${title}" (${rows.length} rows) for tenant ${_tenantId}`);

    const data = rows as Record<string, any>[];

    if (format === 'pdf') {
      const pdfBuffer = await this.reportExportService.exportPdf(_tenantId, 'custom', title, data, columns);

      // Return base64-encoded PDF for download
      const base64 = pdfBuffer.toString('base64');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              format: 'pdf',
              title,
              rowCount: rows.length,
              message: `Generated PDF report "${title}" with ${rows.length} rows.`,
            }),
          },
        ],
        _card: {
          type: 'report_download' as const,
          data: {
            title,
            format: 'pdf',
            rowCount: rows.length,
            base64,
            mimeType: 'application/pdf',
            filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
          },
        },
      };
    }

    // CSV format
    const csvContent = await this.reportExportService.exportCsv(_tenantId, 'custom', title, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            format: 'csv',
            title,
            rowCount: rows.length,
            message: `Generated CSV report "${title}" with ${rows.length} rows.`,
            csv: csvContent,
          }),
        },
      ],
      _card: {
        type: 'report_download' as const,
        data: {
          title,
          format: 'csv',
          rowCount: rows.length,
          content: csvContent,
          mimeType: 'text/csv',
          filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`,
        },
      },
    };
  }
}
