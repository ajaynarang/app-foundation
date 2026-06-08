'use client';

import { CONTACTS, mailto } from '@/lib/contacts';
import { Separator } from '@sally/ui/components/ui/separator';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { useOrganization } from '../../../../hooks/use-account';

interface OrgField {
  label: string;
  value: string | null | undefined;
}

function FieldRow({ label, value }: OrgField) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2">
      <span className="text-sm font-medium text-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm text-muted-foreground">{value || '--'}</span>
    </div>
  );
}

export default function OrganizationPage() {
  const { companyName, tenantId, contactEmail } = useOrganization();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization</h1>
        <p className="text-muted-foreground mt-1">View your organization details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>Organization information from your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <FieldRow label="Company Name" value={companyName} />
            <FieldRow label="Tenant ID" value={tenantId} />
            <FieldRow label="Contact Email" value={contactEmail} />
          </div>
          <Separator className="my-4" />
          <p className="text-sm text-muted-foreground">
            Contact{' '}
            <a
              href={mailto('sallySupport')}
              className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
            >
              {CONTACTS.sallySupport}
            </a>{' '}
            to update organization details such as address, DOT number, or MC number.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
