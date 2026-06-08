import {
  FileText,
  Image,
  Receipt,
  Scale,
  File,
  HeartPulse,
  FlaskConical,
  ClipboardList,
  ClipboardCheck,
  Award,
  BadgeCheck,
  ShieldCheck,
  IdCard,
  FileSignature,
} from 'lucide-react';
import { getDocumentTypeIcon } from '../types';

/** Icon component map for document types. Shared by DocumentList and DocSidebar. */
export const DOCUMENT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-text': FileText,
  receipt: Receipt,
  scale: Scale,
  image: Image,
  file: File,
  'id-card': IdCard,
  'heart-pulse': HeartPulse,
  'flask-conical': FlaskConical,
  'clipboard-list': ClipboardList,
  'clipboard-check': ClipboardCheck,
  award: Award,
  'file-signature': FileSignature,
  'badge-check': BadgeCheck,
  'shield-check': ShieldCheck,
};

export function DocumentIcon({ type, className }: { type: string; className?: string }) {
  const iconName = getDocumentTypeIcon(type);
  const IconComponent = DOCUMENT_ICON_MAP[iconName] ?? File;
  return <IconComponent className={className ?? 'h-5 w-5 flex-shrink-0'} />;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPdfMimeType(mimeType: string | null): boolean {
  return mimeType === 'application/pdf';
}

export function isImageMimeType(mimeType: string | null, fileName?: string): boolean {
  if (mimeType != null && mimeType.startsWith('image/')) return true;
  // Fallback: check file extension when mimeType is missing
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif', 'heic', 'bmp'].includes(ext ?? '');
  }
  return false;
}
