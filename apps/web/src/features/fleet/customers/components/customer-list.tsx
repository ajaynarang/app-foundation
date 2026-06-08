'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Input } from '@sally/ui/components/ui/input';
import { Search, X } from 'lucide-react';
import { customersApi } from '../api';
import type { Customer } from '../types';
import { CustomerDetailSheet } from './customer-detail-sheet';
import { useFactoringCompanies } from '@/features/financials/billing/hooks/use-invoices';

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  BROKER: 'Broker',
  SHIPPER: 'Shipper',
  THREE_PL: '3PL',
  CARRIER: 'Outside Carrier',
};

export function CustomerList() {
  const queryClient = useQueryClient();
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: factoringCompanies } = useFactoringCompanies();

  // Always fetch all customers (including inactive) — filter client-side
  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.listWithInactive(),
  });

  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const handleViewClick = (customer: Customer) => {
    setDetailCustomer(customer);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!customers?.length) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No customers yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Click + Add Customer to add your first.</p>
      </div>
    );
  }

  // "Active" tab shows all non-deactivated customers (ACTIVE, ON_HOLD, SUSPENDED)
  // "Inactive" tab shows only deactivated customers (INACTIVE)
  const statusFiltered =
    statusFilter === 'all'
      ? customers
      : statusFilter === 'active'
        ? customers.filter((c) => c.status !== 'INACTIVE')
        : customers.filter((c) => c.status === 'INACTIVE');

  const filteredCustomers = searchQuery.trim()
    ? statusFiltered.filter((c) => {
        const q = searchQuery.toLowerCase();
        const contactMatch = c.contacts?.some(
          (ct) =>
            `${ct.firstName} ${ct.lastName}`.toLowerCase().includes(q) ||
            ct.email?.toLowerCase().includes(q) ||
            ct.phone?.toLowerCase().includes(q),
        );
        return (
          c.companyName?.toLowerCase().includes(q) ||
          c.mcNumber?.toLowerCase().includes(q) ||
          c.dotNumber?.toLowerCase().includes(q) ||
          c.defaultBillingPath?.toLowerCase().includes(q) ||
          contactMatch
        );
      })
    : statusFiltered;

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="inline-flex items-center rounded-lg border border-border p-1 bg-muted">
          <Button
            variant={statusFilter === 'active' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('active')}
            className="h-7 text-xs"
          >
            Active
          </Button>
          <Button
            variant={statusFilter === 'inactive' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('inactive')}
            className="h-7 text-xs"
          >
            Inactive
          </Button>
          <Button
            variant={statusFilter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="h-7 text-xs"
          >
            All
          </Button>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, MC#, contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1 h-7 w-7"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Billing</TableHead>
              <TableHead className="hidden lg:table-cell">MC#</TableHead>
              <TableHead className="hidden lg:table-cell">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => {
              const primaryContact = customer.contacts?.find((c) => c.isPrimary);
              const contactDisplayName = primaryContact
                ? `${primaryContact.firstName} ${primaryContact.lastName}`
                : undefined;
              const _contactDisplayPhone = primaryContact?.phone;

              return (
                <TableRow
                  key={customer.customerId}
                  className={`cursor-pointer ${customer.status === 'INACTIVE' ? 'opacity-50' : ''}`}
                  onClick={() => handleViewClick(customer)}
                >
                  <TableCell>
                    <span className="font-medium text-foreground">{customer.companyName}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">
                      {CUSTOMER_TYPE_LABELS[customer.customerType] ?? customer.customerType}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {customer.status === 'ACTIVE' && <Badge variant="default">Active</Badge>}
                    {customer.status === 'ON_HOLD' && <Badge variant="muted">On Hold</Badge>}
                    {customer.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                    {customer.status === 'INACTIVE' && <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {customer.defaultBillingPath ? (
                      <div>
                        <span className="text-sm text-foreground">
                          {customer.defaultBillingPath.charAt(0) + customer.defaultBillingPath.slice(1).toLowerCase()}
                        </span>
                        {customer.defaultBillingPath === 'FACTORED' && customer.defaultFactoringCompanyId && (
                          <div className="text-xs text-muted-foreground">
                            {
                              factoringCompanies?.find(
                                (c: { id: number; companyName: string }) => c.id === customer.defaultFactoringCompanyId,
                              )?.companyName
                            }
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground font-mono text-xs">
                    {customer.mcNumber || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {contactDisplayName ? (
                      <div>
                        <span className="text-sm text-foreground">{contactDisplayName}</span>
                        <div className="text-xs text-muted-foreground">
                          {primaryContact?.email || primaryContact?.phone || ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CustomerDetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false);
        }}
        customer={detailCustomer}
        onMutate={invalidateCustomers}
      />
    </>
  );
}

export default CustomerList;
