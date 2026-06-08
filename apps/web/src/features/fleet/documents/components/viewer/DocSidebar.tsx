'use client';

import { Plus, Upload } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { getDocumentTypeLabel } from '../../types';
import type { Document } from '../../types';
import type { DocumentTypeCode } from '@sally/shared-types';
import { DocumentIcon, formatFileSize } from '../shared';

export interface MissingDocSlot {
  typeCode: DocumentTypeCode;
  label: string;
}

interface DocSidebarProps {
  documents: Document[];
  missingDocs: MissingDocSlot[];
  selectedDocId: number | null;
  onSelectDoc: (docId: number) => void;
  onUploadMissing: (docType: string) => void;
  onUploadNew: () => void;
  onHoverDoc?: (docId: number) => void;
}

export function DocSidebar({
  documents,
  missingDocs,
  selectedDocId,
  onSelectDoc,
  onUploadMissing,
  onUploadNew,
  onHoverDoc,
}: DocSidebarProps) {
  return (
    <>
      {/* ── Mobile: horizontal scrollable pills ── */}
      <div className="md:hidden border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelectDoc(doc.id)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors',
                'border border-border',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedDocId === doc.id
                  ? 'bg-accent/50 border-accent text-foreground font-medium'
                  : 'bg-background text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              <DocumentIcon type={doc.documentType} className="h-3.5 w-3.5" />
              <span className="truncate max-w-[100px]">{getDocumentTypeLabel(doc.documentType)}</span>
            </button>
          ))}
          {missingDocs.map((slot) => (
            <button
              key={slot.typeCode}
              type="button"
              onClick={() => onUploadMissing(slot.typeCode)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border border-dashed border-critical/40 text-muted-foreground hover:bg-critical/5 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-critical shrink-0" />
              <span className="truncate max-w-[80px]">{slot.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onUploadNew}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* ── Desktop: vertical sidebar ── */}
      <div className="hidden md:flex w-[220px] shrink-0 border-r border-border bg-background flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {/* Uploaded documents */}
          {documents.length > 0 && (
            <div>
              <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">Uploaded</p>
              <div className="space-y-0.5">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onSelectDoc(doc.id)}
                    onMouseEnter={() => onHoverDoc?.(doc.id)}
                    className={cn(
                      'w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                      'hover:bg-gray-100 dark:hover:bg-gray-800',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedDocId === doc.id && 'bg-accent/50 border border-accent ring-1 ring-accent/30',
                    )}
                  >
                    <div className="mt-0.5 shrink-0 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      <DocumentIcon type={doc.documentType} className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {getDocumentTypeLabel(doc.documentType)}
                      </p>
                      <p className="text-2xs text-muted-foreground truncate">{doc.fileName}</p>
                      <p className="text-2xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Missing documents */}
          {missingDocs.length > 0 && (
            <div>
              <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">Missing</p>
              <div className="space-y-0.5">
                {missingDocs.map((slot) => (
                  <button
                    key={slot.typeCode}
                    type="button"
                    onClick={() => onUploadMissing(slot.typeCode)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-critical/40 text-left',
                      'hover:bg-critical/5 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-critical shrink-0" />
                    <DocumentIcon type={slot.typeCode} className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate flex-1">{slot.label}</span>
                    <Upload className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload new button */}
        <div className="border-t border-border p-2">
          <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={onUploadNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Upload Document
          </Button>
        </div>
      </div>
    </>
  );
}
