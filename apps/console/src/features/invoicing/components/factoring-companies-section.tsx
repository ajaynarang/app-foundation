'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import { Pencil, Trash2, Plus, Star, X, Save } from 'lucide-react';
import {
  useFactoringCompanies,
  useCreateFactoringCompany,
  useUpdateFactoringCompany,
  useDeleteFactoringCompany,
} from '../use-factoring';

interface FactoringCompany {
  id: number;
  companyId: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceAddress: string | null;
  isDefault: boolean;
}

interface FormState {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  remittanceAddress: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormState = {
  companyName: '',
  contactEmail: '',
  contactPhone: '',
  remittanceAddress: '',
  isDefault: false,
};

export function FactoringCompaniesSection() {
  const { data: companies, isLoading } = useFactoringCompanies();
  const createMutation = useCreateFactoringCompany();
  const updateMutation = useUpdateFactoringCompany();
  const deleteMutation = useDeleteFactoringCompany();

  const [mode, setMode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setMode('adding');
  };

  const startEdit = (company: FactoringCompany) => {
    setForm({
      companyName: company.companyName,
      contactEmail: company.contactEmail ?? '',
      contactPhone: company.contactPhone ?? '',
      remittanceAddress: company.remittanceAddress ?? '',
      isDefault: company.isDefault,
    });
    setMode(`editing:${company.companyId}`);
  };

  const cancel = () => {
    setMode(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) return;

    const payload = {
      companyName: form.companyName.trim(),
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      remittanceAddress: form.remittanceAddress.trim() || undefined,
      isDefault: form.isDefault,
    };

    try {
      if (mode === 'adding') {
        await createMutation.mutateAsync(payload);
      } else if (mode?.startsWith('editing:')) {
        const companyId = mode.replace('editing:', '');
        await updateMutation.mutateAsync({ companyId, data: payload });
      }
      cancel();
    } catch {
      // Error toast already fired by the mutation hook.
    }
  };

  const handleDelete = (companyId: string) => {
    deleteMutation.mutate(companyId);
  };

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const renderForm = () => (
    <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30" onKeyDown={handleFormKeyDown}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fc-name">Company Name *</Label>
          <Input
            id="fc-name"
            placeholder="OTR Solutions"
            autoFocus
            value={form.companyName}
            onChange={(e) => handleChange('companyName', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fc-email">Contact Email</Label>
          <Input
            id="fc-email"
            type="email"
            placeholder="payments@otr.com"
            value={form.contactEmail}
            onChange={(e) => handleChange('contactEmail', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fc-phone">Contact Phone</Label>
          <Input
            id="fc-phone"
            placeholder="(555) 123-4567"
            value={form.contactPhone}
            onChange={(e) => handleChange('contactPhone', e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fc-address">Remittance Address</Label>
        <Textarea
          id="fc-address"
          placeholder="123 Factor St, Suite 100, Dallas, TX 75201"
          rows={2}
          value={form.remittanceAddress}
          onChange={(e) => handleChange('remittanceAddress', e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="fc-default"
          checked={form.isDefault}
          onCheckedChange={(checked) => handleChange('isDefault', checked === true)}
        />
        <Label htmlFor="fc-default" className="text-sm font-normal">
          Set as default factoring company
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={cancel} disabled={isSaving}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button onClick={handleSave} loading={isSaving} disabled={!form.companyName.trim()}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );

  const renderCompany = (company: FactoringCompany) => {
    const isEditing = mode === `editing:${company.companyId}`;

    if (isEditing) return renderForm();

    return (
      <div className="flex flex-col sm:flex-row sm:items-start justify-between border border-border rounded-lg p-4 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{company.companyName}</span>
            {company.isDefault && (
              <Badge variant="muted" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Default
              </Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
            {company.contactEmail && <div>{company.contactEmail}</div>}
            {company.contactPhone && <div>{company.contactPhone}</div>}
            {company.remittanceAddress && <div className="truncate">{company.remittanceAddress}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${company.companyName}`}
            onClick={() => startEdit(company)}
            disabled={mode !== null}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${company.companyName}`}
                disabled={mode !== null || deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {company.companyName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This won&apos;t un-factor invoices already factored through this company. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    loading={deleteMutation.isPending}
                    onClick={() => handleDelete(company.companyId)}
                  >
                    Delete
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Factoring Companies</CardTitle>
        <CardDescription>
          Manage companies you factor invoices through. Select a factoring company when factoring an invoice from the
          billing page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (companies?.length ?? 0) === 0 && mode !== 'adding' ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No factoring companies yet. Add one to start factoring invoices.
          </p>
        ) : (
          <div className="space-y-3">
            {companies?.map((c: FactoringCompany) => (
              <div key={c.companyId}>{renderCompany(c)}</div>
            ))}
          </div>
        )}

        {mode === 'adding' && renderForm()}

        {mode === null && (
          <Button variant="outline" onClick={startAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Factoring Company
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
