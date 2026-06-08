import type { Load } from '@/features/fleet/loads/types';

export interface LoadInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  balanceCents: number;
  dueDate: string | null;
  paidDate: string | null;
  createdAt: string | null;
}

export type LoadWithInvoices = Load & { invoices?: LoadInvoice[] };

export function getLoadInvoice(load: LoadWithInvoices): LoadInvoice | null {
  return load.invoices?.[0] ?? null;
}

export function hasInvoice(load: LoadWithInvoices): boolean {
  return !!load.invoices?.length || load.billingStatus === 'INVOICED' || load.billingStatus === 'CLOSED';
}
