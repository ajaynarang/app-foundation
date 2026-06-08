'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@sally/ui/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import { getComplianceDocumentTypes, DocumentStatus } from '@sally/shared-types';
import { useDocuments, useDocumentDownloadUrl } from '../../hooks/use-documents';
import { queryKeys } from '@/shared/constants/query-keys';

import type { DocumentEntityType } from '@sally/shared-types';
import { isImageMimeType } from '../shared';
import { DocSidebar, type MissingDocSlot } from './DocSidebar';
import { PreviewPane } from './PreviewPane';
import { useDocumentViewerKeyboard } from '../../hooks/use-document-viewer-keyboard';
import { DocumentUploadDialog } from '../DocumentUploadDialog';
import { getDocumentTypesForEntity } from '../../types';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'load' | 'load_stop' | 'driver' | 'vehicle';
  entityId: number;
  initialDocumentId?: number;
}

export function DocumentViewerDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  initialDocumentId,
}: DocumentViewerDialogProps) {
  const queryClient = useQueryClient();
  const { data: documents = [], isLoading: docsLoading } = useDocuments(entityType, entityId);

  // Selected document state
  const [selectedDocId, setSelectedDocId] = useState<number | null>(initialDocumentId ?? null);

  // Zoom / rotation state
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPreselectedType, setUploadPreselectedType] = useState<string | undefined>();

  // Fetch download URL for selected document
  const { data: downloadData, isLoading: urlLoading } = useDocumentDownloadUrl(
    open && selectedDocId ? selectedDocId : null,
  );

  // Selected document object
  const selectedDoc = useMemo(() => documents.find((d) => d.id === selectedDocId) ?? null, [documents, selectedDocId]);

  // Auto-select first document when docs load or initialDocumentId changes
  useEffect(() => {
    if (!open) return;
    if (initialDocumentId && documents.some((d) => d.id === initialDocumentId)) {
      setSelectedDocId(initialDocumentId);
    } else if (documents.length > 0 && !selectedDoc) {
      setSelectedDocId(documents[0].id);
    }
  }, [open, documents, initialDocumentId, selectedDoc]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setScale(1);
      setRotation(0);
      setSelectedDocId(null);
    }
  }, [open]);

  // Reset zoom/rotation when switching documents
  useEffect(() => {
    setScale(1);
    setRotation(0);
  }, [selectedDocId]);

  // Compliance badge: only for entity types that have compliance requirements
  const complianceInfo = useMemo(() => {
    // load_stop doesn't have its own compliance types
    if (entityType === 'load_stop') return null;
    const complianceTypes = getComplianceDocumentTypes(entityType as DocumentEntityType);
    if (complianceTypes.length === 0) return null;

    const total = complianceTypes.length;
    const satisfied = complianceTypes.filter(([code]) =>
      documents.some((d) => d.documentType === code && d.status === DocumentStatus.CONFIRMED),
    ).length;

    return { satisfied, total };
  }, [entityType, documents]);

  // Missing documents
  const missingDocs: MissingDocSlot[] = useMemo(() => {
    if (entityType === 'load_stop') return [];
    const complianceTypes = getComplianceDocumentTypes(entityType as DocumentEntityType);
    return complianceTypes
      .filter(([code]) => !documents.some((d) => d.documentType === code && d.status === DocumentStatus.CONFIRMED))
      .map(([code, config]) => ({
        typeCode: code,
        label: config.label,
      }));
  }, [entityType, documents]);

  // Navigation
  const currentIndex = useMemo(() => documents.findIndex((d) => d.id === selectedDocId), [documents, selectedDocId]);

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedDocId(documents[currentIndex - 1].id);
    }
  }, [currentIndex, documents]);

  const navigateNext = useCallback(() => {
    if (currentIndex < documents.length - 1) {
      setSelectedDocId(documents[currentIndex + 1].id);
    }
  }, [currentIndex, documents]);

  // Zoom callbacks — single source of truth, passed to both keyboard hook and PreviewPane
  const canZoomIn = scale < ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  const canZoomOut = scale > ZOOM_LEVELS[0];

  const handleZoomIn = useCallback(() => {
    const nextLevel = ZOOM_LEVELS.find((z) => z > scale);
    if (nextLevel) setScale(nextLevel);
  }, [scale]);

  const handleZoomOut = useCallback(() => {
    const prevLevel = [...ZOOM_LEVELS].reverse().find((z) => z < scale);
    if (prevLevel) setScale(prevLevel);
  }, [scale]);

  const handleFit = useCallback(() => {
    setScale(1);
    setRotation(0);
  }, []);

  const handleRotateCW = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  const handleRotateCCW = useCallback(() => {
    setRotation((r) => (r - 90 + 360) % 360);
  }, []);

  // Keyboard shortcuts
  useDocumentViewerKeyboard({
    enabled: open && !uploadOpen,
    onPrevious: navigatePrev,
    onNext: navigateNext,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleFit,
    onRotateCW: handleRotateCW,
    onRotateCCW: handleRotateCCW,
    canRotate: selectedDoc ? isImageMimeType(selectedDoc.mimeType, selectedDoc.fileName) : false,
  });

  // Prefetch download URL on hover
  const handleHoverDoc = useCallback(
    (docId: number) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.documents.downloadUrl(docId),
        queryFn: () => import('../../api').then((m) => m.documentsApi.getDownloadUrl(docId)),
      });
    },
    [queryClient],
  );

  // Upload handlers
  const handleUploadMissing = useCallback((docType: string) => {
    setUploadPreselectedType(docType);
    setUploadOpen(true);
  }, []);

  const handleUploadNew = useCallback(() => {
    setUploadPreselectedType(undefined);
    setUploadOpen(true);
  }, []);

  // Resolve document types for upload dialog
  const resolvedDocTypes = useMemo(
    () => getDocumentTypesForEntity(entityType === 'load_stop' ? 'load' : entityType),
    [entityType],
  );

  // Compliance badge styling
  const badgeClassName = useMemo(() => {
    if (!complianceInfo) return '';
    if (complianceInfo.satisfied === complianceInfo.total) return 'bg-muted text-muted-foreground border-transparent';
    if (complianceInfo.satisfied > 0) return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-transparent';
    return 'bg-critical/10 text-critical border-transparent';
  }, [complianceInfo]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content className="fixed inset-0 md:inset-4 z-50 flex flex-col bg-background border border-border md:rounded-lg shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-base font-semibold text-foreground">Documents</h2>
                {complianceInfo && (
                  <Badge variant="outline" className={cn('text-xs', badgeClassName)}>
                    {complianceInfo.satisfied} of {complianceInfo.total}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Keyboard shortcut hints */}
                <div className="hidden md:flex items-center gap-3 text-2xs text-muted-foreground">
                  <span>← → Navigate</span>
                  <span>+ − Zoom</span>
                  <span>0 Fit</span>
                  <span>R Rotate</span>
                  <span>ESC Close</span>
                </div>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>

            {/* Body */}
            {docsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="space-y-3 w-full max-w-md px-6">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-8 w-1/2" />
                  <Skeleton className="h-[300px] w-full mt-4" />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Sidebar */}
                <DocSidebar
                  documents={documents}
                  missingDocs={missingDocs}
                  selectedDocId={selectedDocId}
                  onSelectDoc={setSelectedDocId}
                  onUploadMissing={handleUploadMissing}
                  onUploadNew={handleUploadNew}
                  onHoverDoc={handleHoverDoc}
                />

                {/* Preview */}
                <PreviewPane
                  documentId={selectedDocId}
                  fileName={selectedDoc?.fileName ?? ''}
                  fileSize={selectedDoc?.fileSize ?? null}
                  mimeType={selectedDoc?.mimeType ?? null}
                  downloadUrl={downloadData?.downloadUrl ?? null}
                  isLoading={urlLoading}
                  scale={scale}
                  rotation={rotation}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onFit={handleFit}
                  onRotateCW={handleRotateCW}
                  onRotateCCW={handleRotateCCW}
                  canZoomIn={canZoomIn}
                  canZoomOut={canZoomOut}
                />
              </div>
            )}

            {/* Accessible title for screen readers */}
            <DialogPrimitive.Title className="sr-only">Document Viewer</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              View and navigate documents for this entity
            </DialogPrimitive.Description>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Upload dialog — layered on top */}
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType={entityType === 'load_stop' ? 'load' : entityType}
        entityId={entityId}
        documentTypes={resolvedDocTypes}
        preselectedType={uploadPreselectedType}
      />
    </>
  );
}
