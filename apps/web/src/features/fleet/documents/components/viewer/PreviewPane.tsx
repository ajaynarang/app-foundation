'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ZoomIn, ZoomOut, Maximize, RotateCw, RotateCcw, Download } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError } from '@sally/ui';
import { documentsApi } from '../../api';
import { formatFileSize, isPdfMimeType, isImageMimeType } from '../shared';
import { ImagePreview } from './ImagePreview';

// Dynamically import PdfPreview to avoid loading pdfjs-dist on initial bundle
const PdfPreview = dynamic(() => import('./PdfPreview').then((m) => ({ default: m.PdfPreview })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4 p-4">
      <Skeleton className="h-[600px] w-[450px] rounded" />
    </div>
  ),
});

interface PreviewPaneProps {
  documentId: number | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  downloadUrl: string | null;
  isLoading: boolean;
  scale: number;
  rotation: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export function PreviewPane({
  documentId,
  fileName,
  fileSize,
  mimeType,
  downloadUrl,
  isLoading,
  scale,
  rotation,
  onZoomIn,
  onZoomOut,
  onFit,
  onRotateCW,
  onRotateCCW,
  canZoomIn,
  canZoomOut,
}: PreviewPaneProps) {
  const canRotate = isImageMimeType(mimeType, fileName);

  const handleDownload = useCallback(async () => {
    if (!documentId) return;
    try {
      // Fetch a fresh presigned URL for download
      const { downloadUrl: freshUrl } = await documentsApi.getDownloadUrl(documentId);
      window.open(freshUrl, '_blank', 'noopener,noreferrer');
    } catch {
      showError('Failed to download document');
    }
  }, [documentId]);

  // Empty state
  if (!documentId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Select a document to preview</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[300px]">
            {fileName}
          </span>
          {fileSize !== null && (
            <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(fileSize)}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls — hidden on mobile (use pinch-to-zoom) */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onZoomOut}
              disabled={!canZoomOut}
              title="Zoom out (-)"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onZoomIn}
              disabled={!canZoomIn}
              title="Zoom in (+)"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFit} title="Fit to view (0)">
              <Maximize className="h-3.5 w-3.5" />
            </Button>

            {/* Separator */}
            <div className="w-px h-4 bg-border mx-1" />
          </div>

          {/* Rotate controls — always visible */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRotateCCW}
            disabled={!canRotate}
            title="Rotate counterclockwise (Shift+R)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRotateCW}
            disabled={!canRotate}
            title="Rotate clockwise (R)"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>

          {/* Separator */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* Download */}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-[500px] w-[400px] rounded" />
          </div>
        ) : downloadUrl ? (
          isPdfMimeType(mimeType) ? (
            <PdfPreview url={downloadUrl} scale={scale} />
          ) : isImageMimeType(mimeType, fileName) ? (
            <ImagePreview url={downloadUrl} scale={scale} rotation={rotation} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Unable to load preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
