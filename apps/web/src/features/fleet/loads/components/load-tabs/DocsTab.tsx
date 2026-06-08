'use client';

import { useState, useCallback } from 'react';
import { Plus, Eye } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { FileText } from 'lucide-react';
import { useDocuments, getDocumentTypesForEntity, DocumentViewerDialog } from '@/features/fleet/documents';
import { DocumentList } from '@/features/fleet/documents/components/DocumentList';
import { DocumentUploadDialog } from '@/features/fleet/documents/components/DocumentUploadDialog';
import type { Load } from '@/features/fleet/loads/types';

interface DocsTabProps {
  load: Load;
}

export function DocsTab({ load }: DocsTabProps) {
  const { data: documents = [], isLoading } = useDocuments('load', load.id);
  const documentTypes = getDocumentTypesForEntity('load');
  const [uploadOpen, setUploadOpen] = useState(false);
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

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isLoading ? '...' : `${documents.length} document${documents.length !== 1 ? 's' : ''} uploaded`}
        </span>
        <div className="flex gap-2">
          {documents.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleViewAll}>
              <Eye className="h-3 w-3 mr-1" /> View All
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUploadOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Upload
          </Button>
        </div>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">No documents uploaded yet</p>
          <p className="text-xs mt-1">Use the upload button above to attach documents to this load.</p>
        </div>
      ) : (
        <DocumentList documents={documents} entityType="load" entityId={load.id} onViewDoc={handleViewDoc} />
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType="load"
        entityId={load.id}
        documentTypes={documentTypes}
      />

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        entityType="load"
        entityId={load.id}
        initialDocumentId={viewerInitialDocId}
      />
    </div>
  );
}
