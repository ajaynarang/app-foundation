'use client';

import { Separator } from '@sally/ui/components/ui/separator';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { USER_ROLES, type UserRoleValue } from '@sally/shared-types';

import { mailto, CONTACTS } from '@/shared/lib/contacts';
import { useAuthStore } from '@/features/auth';
import { useOrganization, useUpdateOrganization } from '@/features/platform/settings';
import { OrganizationForm } from '@/features/platform/settings/components/organization-form';

// ---------------------------------------------------------------------------
// Read-only field row (non-editable roles)
// ---------------------------------------------------------------------------
function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2">
      <span className="text-sm font-medium text-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm text-muted-foreground">{value || '--'}</span>
    </div>
  );
}

const EDITABLE_ROLES: ReadonlyArray<UserRoleValue> = [USER_ROLES.OWNER, USER_ROLES.ADMIN];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OrganizationPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = !!user && EDITABLE_ROLES.includes(user.role as UserRoleValue);

  // The profile endpoint is ADMIN/OWNER-only — non-editable roles fall back to
  // the limited auth-store values rather than firing a request that 403s.
  const { data: profile, isLoading } = useOrganization({ enabled: canEdit });
  const update = useUpdateOrganization();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization</h1>
        <p className="text-muted-foreground mt-1">Your company, kept current</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>
            {canEdit
              ? 'Update your company profile and the timezone Sally schedules in'
              : 'Organization information from your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit && isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-32 ml-auto" />
            </div>
          ) : canEdit && profile ? (
            <OrganizationForm
              profile={profile}
              isSubmitting={update.isPending}
              onSubmit={(data) => update.mutate(data)}
              submitError={update.error}
            />
          ) : (
            <>
              <div className="divide-y divide-border">
                <FieldRow label="Company Name" value={user?.tenantName} />
                <FieldRow label="Tenant ID" value={user?.tenantId} />
                <FieldRow label="Contact Email" value={user?.email} />
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
                to update organization details.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
