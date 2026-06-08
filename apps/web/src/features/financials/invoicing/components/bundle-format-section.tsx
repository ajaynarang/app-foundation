'use client';

import { useAuthStore } from '@/features/auth/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@sally/ui/components/ui/radio-group';
import { Label } from '@sally/ui/components/ui/label';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useTenantFactoringDefault } from '../use-tenant-factoring-default';
import { useSetTenantBundleFormat } from '../use-tenant-bundle-format';
import { BundleFormatSchema, USER_ROLES, type BundleFormat } from '@sally/shared-types';

const FORMAT = BundleFormatSchema.enum;

interface FormatOption {
  value: BundleFormat;
  label: string;
  hint: string;
  recommended?: boolean;
}

const OPTIONS: FormatOption[] = [
  {
    value: FORMAT.ZIP,
    label: 'ZIP (separate files)',
    hint: 'Invoice, rate-con, BOL, and POD as 4 PDFs inside one .zip — universally accepted by every factor.',
    recommended: true,
  },
  {
    value: FORMAT.MERGED_PDF,
    label: 'Merged PDF (single file)',
    hint: 'All 4 sections combined into one PDF. Use this only if your factor specifically requires a merged file.',
  },
];

/**
 * Tenant-level setting that controls what `submit-to-factor` attaches: a ZIP
 * of separate PDFs (default, safer) or a single merged PDF (Phase 2 behavior,
 * opt-in). ADMIN/OWNER only — DISPATCHER sees the radio group disabled with
 * a hint explaining why.
 */
export function BundleFormatSection() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.OWNER;

  const { data, isLoading } = useTenantFactoringDefault();
  const setFormat = useSetTenantBundleFormat();

  const current: BundleFormat = data?.bundleFormat ?? FORMAT.ZIP;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-base text-foreground">Factor bundle format</CardTitle>
        <CardDescription className="text-muted-foreground">
          What we attach when emailing your factor — applies to every submit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <RadioGroup
            value={current}
            onValueChange={(value) => {
              if (!canEdit) return;
              if (value === current) return;
              const parsed = BundleFormatSchema.safeParse(value);
              if (!parsed.success) return;
              setFormat.mutate(parsed.data);
            }}
            disabled={!canEdit || setFormat.isPending}
            className="space-y-3"
          >
            {OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                <RadioGroupItem
                  value={opt.value}
                  id={`bundle-format-${opt.value}`}
                  disabled={!canEdit || setFormat.isPending}
                  aria-describedby={`bundle-format-${opt.value}-hint`}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`bundle-format-${opt.value}`} className="text-sm font-medium text-foreground">
                    {opt.label}
                    {opt.recommended && (
                      <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        Recommended
                      </span>
                    )}
                  </Label>
                  <p id={`bundle-format-${opt.value}-hint`} className="text-xs text-muted-foreground">
                    {opt.hint}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        )}
        {!canEdit && !isLoading && (
          <p className="mt-3 text-xs text-muted-foreground">Only an admin or owner can change this setting.</p>
        )}
      </CardContent>
    </Card>
  );
}
