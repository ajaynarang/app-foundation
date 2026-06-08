'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { showSuccess, showError } from '@sally/ui';

interface ReportDownloadData {
  title: string;
  format: 'csv' | 'pdf';
  rowCount: number;
  filename: string;
  mimeType: string;
  base64?: string;
  content?: string;
}

export function ReportDownloadCard({ data }: { data: Record<string, unknown> }) {
  const report = data as unknown as ReportDownloadData;
  const Icon = report.format === 'pdf' ? FileText : FileSpreadsheet;

  function handleDownload() {
    try {
      let blob: Blob;

      if (report.format === 'pdf' && report.base64) {
        const binary = atob(report.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: report.mimeType });
      } else if (report.content) {
        blob = new Blob([report.content], { type: report.mimeType });
      } else {
        showError('Download failed', 'Report data not available');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess(`${report.format.toUpperCase()} downloaded`);
    } catch {
      showError('Download failed', 'Could not generate file');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{report.title}</p>
        </div>
        <span className="text-xs text-muted-foreground">{report.rowCount} rows</span>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
        <Download className="mr-2 h-4 w-4" />
        Download {report.format.toUpperCase()}
      </Button>
    </div>
  );
}
