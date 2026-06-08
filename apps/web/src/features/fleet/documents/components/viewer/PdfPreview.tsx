'use client';

import { useState, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker — use CDN to avoid bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  /** URL string (presigned or blob) */
  url?: string;
  /** Raw PDF data — use for local file preview */
  data?: Uint8Array;
  scale: number;
}

export function PdfPreview({ url, data, scale }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0);

  const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  // pdfjs transfers ArrayBuffer to its worker, detaching the original.
  // We must give it a stable reference that doesn't change on re-renders
  // (e.g. when numPages updates), otherwise Document reloads mid-render.
  //
  // For `data` props: create a single copy and store in a ref. The copy
  // is consumed (detached) by pdfjs on first load, but that's fine —
  // Document keeps its internal pdfDocument reference and doesn't need
  // the buffer again. We only create a new copy when `data` changes.
  const fileSourceRef = useRef<string | { data: Uint8Array } | null>(null);
  const prevDataRef = useRef<Uint8Array | undefined>();
  const prevUrlRef = useRef<string | undefined>();

  if (data !== prevDataRef.current || url !== prevUrlRef.current) {
    prevDataRef.current = data;
    prevUrlRef.current = url;
    fileSourceRef.current = data ? { data: new Uint8Array(data) } : (url ?? null);
  }

  const fileSource = fileSourceRef.current;

  return (
    <div className="flex flex-col items-center gap-8 p-4">
      <Document
        file={fileSource}
        onLoadSuccess={onLoadSuccess}
        loading={<PdfLoadingSkeleton />}
        error={
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <p className="text-sm font-medium">Failed to load PDF</p>
            <p className="text-xs">The file may be corrupted or unavailable.</p>
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i + 1} className="relative mb-8 last:mb-0">
            <div className="bg-white shadow-lg border border-border rounded overflow-hidden">
              <Page pageNumber={i + 1} scale={scale} loading={<Skeleton className="h-[800px] w-[600px]" />} />
            </div>
            <div className="text-center mt-2">
              <span className="text-xs text-muted-foreground">
                Page {i + 1} of {numPages}
              </span>
            </div>
          </div>
        ))}
      </Document>
    </div>
  );
}

function PdfLoadingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <Skeleton className="h-[800px] w-[600px] rounded" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
