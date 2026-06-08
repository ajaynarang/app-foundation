'use client';

import { useState, useCallback } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import { Button } from '@sally/ui/components/ui/button';
import { FileText, ChevronDown, Plus, Eye } from 'lucide-react';
import { useDocuments } from '../hooks/use-documents';
import { DocumentList } from './DocumentList';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentViewerDialog } from './viewer';
import type { DocumentTypeOption } from '../types';
import { getDocumentTypesForEntity } from '../types';

interface CollapsibleDocumentsSectionProps {
  entityType: 'load' | 'driver' | 'vehicle';
  entityId: number;
  documentTypes?: DocumentTypeOption[];
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CollapsibleDocumentsSection({
  entityType,
  entityId,
  documentTypes,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CollapsibleDocumentsSectionProps) {
  const { data: documents = [] } = useDocuments(entityType, entityId);
  const resolvedDocTypes = documentTypes ?? getDocumentTypesForEntity(entityType);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = controlledOnOpenChange ?? setInternalOpen;

  // Document viewer dialog state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitialDocId, setViewerInitialDocId] = useState<number | undefined>();

  const handleViewDoc = useCallback((docId: number) => {
    setViewerInitialDocId(docId);
    setViewerOpen(true);
  }, []);

  const handleViewAll = useCallback(() => {
    setViewerInitialDocId(undefined);
    setViewerOpen(true);
  }, []);

  const docCount = documents.length;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 h-auto min-h-[44px]"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Documents</span>
              <span className="text-xs text-muted-foreground">{docCount} uploaded</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2 space-y-3">
          <div className="px-1">
            <DocumentList documents={documents} entityType={entityType} entityId={entityId} onViewDoc={handleViewDoc} />
          </div>

          <div className="px-1 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
            {docCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleViewAll}>
                <Eye className="h-4 w-4 mr-2" />
                View All
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType={entityType}
        entityId={entityId}
        documentTypes={resolvedDocTypes}
      />

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        entityType={entityType}
        entityId={entityId}
        initialDocumentId={viewerInitialDocId}
      />
    </>
  );
}
