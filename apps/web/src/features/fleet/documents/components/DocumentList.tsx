'use client';

import { useState } from 'react';
import { FileText, Eye, Trash2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import { showSuccess, showError } from '@sally/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { DocumentStatus } from '@sally/shared-types';
import { useDeleteDocument } from '../hooks/use-documents';
import type { Document } from '../types';
import { getDocumentTypeLabel } from '../types';
import { DocumentIcon, formatFileSize } from './shared';

function StatusBadge({ status }: { status: string }) {
  if (status === DocumentStatus.CONFIRMED) {
    return <Badge className="bg-muted text-muted-foreground border-transparent text-xs">Confirmed</Badge>;
  }
  if (status === DocumentStatus.PENDING_UPLOAD) {
    return (
      <Badge variant="muted" className="text-xs">
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-foreground">
      {status}
    </Badge>
  );
}

interface DocumentRowProps {
  document: Document;
  onDeleted: () => void;
  onView?: (docId: number) => void;
}

function DocumentRow({ document, onDeleted, onView }: DocumentRowProps) {
  const { formatTimestamp } = useFormatters();
  const deleteDocument = useDeleteDocument();

  const handleView = () => {
    if (onView) {
      onView(document.id);
    }
  };

  const handleDelete = () => {
    deleteDocument.mutate(document.id, {
      onSuccess: () => {
        showSuccess('Document deleted');
        onDeleted();
      },
      onError: () => {
        showError('Failed to delete document', 'Please try again.');
      },
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <div className="text-muted-foreground mt-0.5">
          <DocumentIcon type={document.documentType} />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground truncate">{document.fileName}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs text-foreground border-border">
              {getDocumentTypeLabel(document.documentType)}
            </Badge>
            <StatusBadge status={document.status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="text-xs text-muted-foreground">{formatFileSize(document.fileSize)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(document.createdAt, DISPLAY_FORMATS.FRIENDLY)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={handleView}
          disabled={!document.s3Key}
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-critical hover:bg-critical/10"
              loading={deleteDocument.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete document</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <span className="font-medium text-foreground">{document.fileName}</span>.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

interface DocumentListProps {
  documents: Document[];
  entityType: string;
  entityId: number;
  onViewDoc?: (docId: number) => void;
}

export function DocumentList({ documents, onViewDoc }: DocumentListProps) {
  // Track locally deleted IDs to give instant feedback while cache revalidates
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const visible = documents.filter((d) => !deletedIds.has(d.id));

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No documents uploaded yet</p>
        <p className="text-xs text-muted-foreground">Use the upload button above to attach documents to this load.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((doc) => (
        <DocumentRow
          key={doc.id}
          document={doc}
          onDeleted={() => setDeletedIds((prev) => new Set(prev).add(doc.id))}
          onView={onViewDoc}
        />
      ))}
    </div>
  );
}
