'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { showSuccess, showError } from '@sally/ui';
import { useAuthStore } from '@/features/auth';
import type { ReportParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ExportMenuProps {
  reportType: string;
  params?: ReportParams;
}

export function ExportMenu({ reportType, params }: ExportMenuProps) {
  const [isPending, setIsPending] = useState(false);

  async function handleExport(format: 'csv' | 'pdf') {
    setIsPending(true);
    try {
      const qp = new URLSearchParams();
      qp.set('format', format);
      if (params?.dateFrom) qp.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qp.set('dateTo', params.dateTo);
      if (params?.groupBy) qp.set('groupBy', params.groupBy);
      const qs = qp.toString();

      const accessToken = useAuthStore.getState().accessToken;
      const res = await fetch(`${API_BASE_URL}/analytics/reports/${reportType}/export?${qs}`, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;';
      const downloadBlob = new Blob([blob], { type: mimeType });
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess(`${format.toUpperCase()} export ready`);
    } catch (error) {
      showError('Export failed', extractErrorMessage(error) || 'Something went wrong');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" loading={isPending}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          <FileText className="mr-2 h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
