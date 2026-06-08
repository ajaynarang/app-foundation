import type { LoadStop } from '@/features/fleet/loads/types';

/** Check if a stop has a document of a given type -- checks BOTH text fields AND uploaded documents */
export function stopHasDocument(stop: LoadStop, docType: 'bol' | 'pod'): boolean {
  // Check text fields (set by dispatcher/ratecon import)
  if (docType === 'bol' && stop.bolNumber) return true;
  if (docType === 'pod' && stop.podSignedBy) return true;
  // Check uploaded document records (set by driver photo uploads)
  return stop.uploadedDocuments?.some((d) => d.documentType === docType) ?? false;
}

/** Check if a stop has ANY document uploaded (text fields or Document records) */
export function stopHasAnyDocument(stop: LoadStop): boolean {
  if (stop.bolNumber || stop.podSignedBy) return true;
  return (stop.uploadedDocuments?.length ?? 0) > 0;
}

/** Get what doc badge to show for a stop: 'uploaded' if docs exist, 'needed' if missing, null if N/A */
export function getStopDocBadge(stop: LoadStop): 'uploaded' | 'needed' | null {
  if (stop.actionType === 'pickup') {
    return stopHasDocument(stop, 'bol') ? 'uploaded' : 'needed';
  }
  if (stop.actionType === 'delivery' || stop.actionType === 'both') {
    return stopHasDocument(stop, 'pod') ? 'uploaded' : 'needed';
  }
  return null;
}

/** Check if a stop has the expected primary doc (BOL for pickup, POD for delivery) */
export function stopHasPrimaryDoc(stop: LoadStop): boolean {
  if (stop.actionType === 'pickup') return stopHasDocument(stop, 'bol');
  return stopHasDocument(stop, 'pod');
}

/** Get the expected doc type label for a stop */
export function getStopDocTypeLabel(stop: LoadStop): 'BOL' | 'POD' {
  return stop.actionType === 'pickup' ? 'BOL' : 'POD';
}
