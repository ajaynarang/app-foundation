'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useDocumentUpload } from '@/features/fleet/drivers/hooks/use-document-upload';
import { useDocuments, DocumentViewerDialog } from '@/features/fleet/documents';
import { showError } from '@sally/ui';
import { getDocumentTypesForEntity } from '@sally/shared-types';
import { queryKeys } from '@/shared/constants/query-keys';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/heic']);
const ACCEPT_STRING = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.heic';

// Driver-relevant doc types at a stop — whitelist approach.
// Drivers should NOT see rate_confirmation (confidential financial info).
const DRIVER_ALLOWED_TYPES = new Set(['bol', 'pod', 'lumper_receipt', 'scale_ticket', 'photo', 'other']);
const DRIVER_DOC_TYPES = getDocumentTypesForEntity('load').filter((dt) => DRIVER_ALLOWED_TYPES.has(dt.value));

interface Props {
  stopId: string;
  loadId: string;
  documentType: 'BOL' | 'POD';
  /** When true, primary doc is already uploaded -- show "add more" copy */
  isAdditional?: boolean;
  onUploaded: () => void;
  onSkip: () => void;
}

export function DocUploadInline({ stopId, loadId: _loadId, documentType, isAdditional, onUploaded, onSkip }: Props) {
  const { upload, isUploading } = useDocumentUpload();
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [isDone, setIsDone] = useState(false);

  // Doc type picker state — pre-select based on stop action type
  const defaultDocType = isAdditional ? '' : documentType.toLowerCase();
  const [selectedDocType, setSelectedDocType] = useState(defaultDocType);

  // Fetch existing documents for this stop
  const { data: existingDocs = [] } = useDocuments('load_stop', Number(stopId));

  // Document viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocId, setViewerDocId] = useState<number | undefined>();

  // Deferred picker: which input to open after doc type is selected
  const [pendingInput, setPendingInput] = useState<'camera' | 'gallery' | null>(null);

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      showError('File too large', 'Maximum file size is 10 MB');
      return;
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      showError('Unsupported file type', 'Allowed: PDF, JPEG, PNG, TIFF, HEIC');
      return;
    }

    const docTypeToUpload = selectedDocType || documentType.toLowerCase();

    try {
      await upload({
        file,
        entityType: 'load_stop',
        entityId: Number(stopId),
        documentType: docTypeToUpload,
        relatedStopId: Number(stopId),
      });
      setIsDone(true);
      // Refresh document list to show the newly uploaded doc
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.list('load_stop', Number(stopId)) });
      onUploaded();
    } catch {
      // error toast handled by useDocumentUpload
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleCapture = (source: 'camera' | 'gallery') => {
    // If additional doc and no type selected yet, show picker first
    if (isAdditional && !selectedDocType) {
      setPendingInput(source);
      return;
    }
    const ref = source === 'camera' ? cameraRef : galleryRef;
    ref.current?.click();
  };

  const handleDocTypeSelected = (value: string) => {
    setSelectedDocType(value);
    // Auto-open the file picker that was deferred
    if (pendingInput) {
      const ref = pendingInput === 'camera' ? cameraRef : galleryRef;
      setPendingInput(null);
      // Small delay to let the select close before opening file picker
      setTimeout(() => ref.current?.click(), 150);
    }
  };

  const subtitle = isAdditional
    ? 'Add photos, weight tickets, or other documents.'
    : documentType === 'BOL'
      ? 'Attach the Bill of Lading for this pickup.'
      : 'Attach the Proof of Delivery for this stop.';

  // After upload: show success + "Add another" option
  if (isDone) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-emerald-500 dark:text-emerald-400 font-medium">
            ✓ {selectedDocType?.toUpperCase() || documentType} uploaded
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => {
            setIsDone(false);
            setSelectedDocType('');
          }}
        >
          + Add another document
        </Button>
      </div>
    );
  }

  // Show doc type picker:
  // - For additional docs: when driver tapped Camera/Gallery without selecting type
  // - Always show selected type chip so driver can change the tag
  const showTypePicker = pendingInput !== null && !selectedDocType;

  const handleViewDoc = (docId: number) => {
    setViewerDocId(docId);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-2">
      {/* Uploaded documents — compact preview list */}
      {existingDocs.length > 0 && (
        <div className="space-y-1">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {existingDocs.map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-2 text-xs rounded-md bg-muted/50 px-2 py-1.5">
              <span className="text-emerald-500 dark:text-emerald-400">✓</span>
              <span className="font-medium text-foreground truncate flex-1">{doc.fileName}</span>
              <span className="text-muted-foreground text-2xs shrink-0">{doc.documentType?.toUpperCase()}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-2xs text-muted-foreground hover:text-foreground"
                onClick={() => handleViewDoc(doc.id)}
              >
                View
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{subtitle}</p>

      {/* Doc type picker — appears when driver taps Camera/Gallery without a type */}
      {showTypePicker && (
        <Select value={selectedDocType} onValueChange={handleDocTypeSelected}>
          <SelectTrigger className="w-full h-9 text-xs" autoFocus>
            <SelectValue placeholder="What type of document?" />
          </SelectTrigger>
          <SelectContent>
            {DRIVER_DOC_TYPES.map((dt) => (
              <SelectItem key={dt.value} value={dt.value}>
                {dt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Selected type chip — always visible, tappable to change */}
      {selectedDocType && !showTypePicker && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            setSelectedDocType('');
            setPendingInput(null);
          }}
        >
          <span className="text-2xs px-1.5 py-0.5 rounded bg-muted font-medium text-foreground">
            {DRIVER_DOC_TYPES.find((dt) => dt.value === selectedDocType)?.label ?? selectedDocType.toUpperCase()}
          </span>
          <span className="text-muted-foreground text-2xs">tap to change type</span>
        </button>
      )}

      {/* Full type picker — when driver cleared the default type */}
      {!selectedDocType && !showTypePicker && !isAdditional && (
        <Select value="" onValueChange={(v) => setSelectedDocType(v)}>
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder={`Type: ${documentType} (tap to change)`} />
          </SelectTrigger>
          <SelectContent>
            {DRIVER_DOC_TYPES.map((dt) => (
              <SelectItem key={dt.value} value={dt.value}>
                {dt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Camera + Gallery + Skip — compact single row */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-10 gap-1.5 text-xs"
          disabled={isUploading}
          onClick={() => handleCapture('camera')}
        >
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          Camera
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-10 gap-1.5 text-xs"
          disabled={isUploading}
          onClick={() => handleCapture('gallery')}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Gallery
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={isUploading}
          className="h-10 px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          Skip
        </Button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT_STRING}
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input ref={galleryRef} type="file" accept={ACCEPT_STRING} className="hidden" onChange={handleInputChange} />

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        entityType="load_stop"
        entityId={Number(stopId)}
        initialDocumentId={viewerDocId}
      />
    </div>
  );
}
