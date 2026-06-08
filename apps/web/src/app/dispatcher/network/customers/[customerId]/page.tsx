'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useCustomerById, CustomerDetailSheet, InviteCustomerDialog } from '@/features/fleet/customers';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  ArrowLeft,
  Pencil,
  Building2,
  DollarSign,
  Users,
  FileText,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Star,
  CreditCard,
} from 'lucide-react';

const PAYMENT_TERMS_LABEL: Record<string, string> = {
  NET_15: 'Net 15',
  NET_30: 'Net 30',
  NET_45: 'Net 45',
  NET_60: 'Net 60',
  NET_90: 'Net 90',
  COD: 'COD',
  QUICK_PAY: 'Quick Pay',
};

const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  SHIPPER: 'Shipper',
  BROKER: 'Broker',
  THREE_PL: '3PL',
  CARRIER: 'Carrier',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

export default function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const { data: customer, isLoading, error } = useCustomerById(customerId);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-6">
        <Link
          href="/dispatcher/network?tab=customers"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Customers
        </Link>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-critical mb-4">{error instanceof Error ? error.message : 'Customer not found'}</p>
            <Button onClick={() => router.push('/dispatcher/network')}>Return to Network</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contacts = customer.contacts || [];
  const primaryContact = contacts.find((c) => c.isPrimary);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/dispatcher/network?tab=customers"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Customers
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{customer.companyName}</h1>
            <Badge variant="outline">
              {CUSTOMER_TYPE_LABEL[customer.customerType as string] || String(customer.customerType)}
            </Badge>
            <Badge
              variant={
                customer.status === 'ACTIVE'
                  ? 'default'
                  : customer.status === 'INACTIVE'
                    ? 'muted'
                    : customer.status === 'SUSPENDED'
                      ? 'destructive'
                      : 'outline'
              }
            >
              {STATUS_LABEL[customer.status as string] || String(customer.status) || 'Unknown'}
            </Badge>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </Button>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">MC Number</p>
                <p className="text-foreground">{customer.mcNumber || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">DOT Number</p>
                <p className="text-foreground">{customer.dotNumber || '\u2014'}</p>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="text-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {customer.address
                  ? `${customer.address}${customer.city ? `, ${customer.city}` : ''}${customer.state ? `, ${customer.state}` : ''}`
                  : '\u2014'}
              </p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Primary Contact</p>
                <p className="text-foreground">
                  {primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}` : '\u2014'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contact Phone</p>
                <p className="text-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {primaryContact?.phone || '\u2014'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4" /> Financial
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Payment Terms</p>
                <p className="text-foreground">
                  {customer.paymentTerms
                    ? PAYMENT_TERMS_LABEL[customer.paymentTerms as string] || String(customer.paymentTerms)
                    : '\u2014'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Limit</p>
                <p className="text-foreground">
                  {customer.creditLimit != null ? `$${customer.creditLimit.toLocaleString()}` : '\u2014'}
                </p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tax ID / EIN</p>
                <p className="text-foreground">{customer.taxId || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billing Email</p>
                <p className="text-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {customer.billingEmail || '\u2014'}
                </p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Default Billing Path</p>
                <p className="text-foreground">{String(customer.defaultBillingPath || '') || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Default Factoring Company</p>
                <p className="text-foreground">
                  {customer.defaultFactoringCompanyId ? `Company #${customer.defaultFactoringCompanyId}` : '\u2014'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Contacts ({contacts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead className="hidden lg:table-cell">Title</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.contactId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {contact.isPrimary && <Star className="h-3 w-3 text-caution fill-current" />}
                        <span className="font-medium text-foreground">
                          {contact.firstName} {contact.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{String(contact.role)}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-foreground">{contact.email || '\u2014'}</TableCell>
                    <TableCell className="hidden md:table-cell text-foreground">{contact.phone || '\u2014'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {contact.title || '\u2014'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">
              No contacts added yet. Click Edit to add contacts.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Billing Address Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Billing Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Billing Address</p>
              <p className="text-foreground">{customer.billingAddress || '\u2014'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billing City</p>
              <p className="text-foreground">{customer.billingCity || '\u2014'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billing State</p>
              <p className="text-foreground">{customer.billingState || '\u2014'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ZIP Code</p>
              <p className="text-foreground">{customer.billingZip || '\u2014'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground whitespace-pre-wrap">
            {customer.notes || <span className="text-muted-foreground">No notes</span>}
          </p>
        </CardContent>
      </Card>

      {/* Portal Access Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4" /> Portal Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {customer.portalAccessStatus === 'ACTIVE' && <Badge variant="default">Active</Badge>}
            {customer.portalAccessStatus === 'INVITED' && <Badge variant="muted">Invited</Badge>}
            {customer.portalAccessStatus === 'DEACTIVATED' && <Badge variant="destructive">Deactivated</Badge>}
            {(!customer.portalAccessStatus || customer.portalAccessStatus === 'NO_ACCESS') && (
              <>
                <Badge variant="outline">No Access</Badge>
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  Invite to Portal
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <CustomerDetailSheet open={editOpen} onOpenChange={setEditOpen} customer={customer} startEditing />

      <InviteCustomerDialog open={inviteOpen} onOpenChange={setInviteOpen} customer={customer} />
    </div>
  );
}
