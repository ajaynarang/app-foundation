'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { useUpdateFactoringCompany, useDeleteFactoringCompany } from '../use-factoring';
import { useTenantFactoringDefault, usePinFactoringCompany } from '../use-tenant-factoring-default';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import {
  Pencil,
  Building2,
  DollarSign,
  Mail,
  Phone,
  MapPin,
  FileText,
  MoreHorizontal,
  Trash2,
  Star,
  AlertCircle,
} from 'lucide-react';

interface FactoringCompany {
  id: number;
  companyId: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceAddress: string | null;
  submissionEmail: string | null;
  advanceRatePct: number | null;
  feeRatePct: number | null;
  recourseType: string | null;
}

interface FormState {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  remittanceAddress: string;
  submissionEmail: string;
  advanceRatePct: string;
  feeRatePct: string;
  recourseType: string;
}

interface FactoringDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: FactoringCompany | null;
}

export function FactoringDetailSheet({ open, onOpenChange, company }: FactoringDetailSheetProps) {
  const sizing = useSheetSizing('factoring');
  const updateMutation = useUpdateFactoringCompany();
  const deleteMutation = useDeleteFactoringCompany();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>({
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    remittanceAddress: '',
    submissionEmail: '',
    advanceRatePct: '',
    feeRatePct: '',
    recourseType: '',
  });

  const { data: tenantDefault } = useTenantFactoringDefault();
  const pinMutation = usePinFactoringCompany();
  const isPinned = company ? tenantDefault?.factoringCompanyId === company.id : false;

  useEffect(() => {
    setIsEditing(false);
  }, [company?.companyId]);

  const initEditForm = useCallback(() => {
    if (!company) return;
    setSaveError(null);
    setEditForm({
      companyName: company.companyName,
      contactEmail: company.contactEmail ?? '',
      contactPhone: company.contactPhone ?? '',
      remittanceAddress: company.remittanceAddress ?? '',
      submissionEmail: company.submissionEmail ?? '',
      advanceRatePct: company.advanceRatePct != null ? String(company.advanceRatePct) : '',
      feeRatePct: company.feeRatePct != null ? String(company.feeRatePct) : '',
      recourseType: company.recourseType ?? '',
    });
  }, [company]);

  const handleSave = async () => {
    if (!company) return;
    if (!editForm.companyName.trim()) {
      setSaveError('Company name is required');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        companyId: company.companyId,
        data: {
          companyName: editForm.companyName.trim(),
          contactEmail: editForm.contactEmail.trim() || undefined,
          contactPhone: editForm.contactPhone.trim() || undefined,
          remittanceAddress: editForm.remittanceAddress.trim() || undefined,
          submissionEmail: editForm.submissionEmail.trim() || undefined,
          advanceRatePct: editForm.advanceRatePct ? Number(editForm.advanceRatePct) : undefined,
          feeRatePct: editForm.feeRatePct ? Number(editForm.feeRatePct) : undefined,
          recourseType: editForm.recourseType || undefined,
        },
      });
      setIsEditing(false);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    try {
      await deleteMutation.mutateAsync(company.companyId);
      setDeleteOpen(false);
      onOpenChange(false);
    } catch {
      // Hook handles toasts
    }
  };

  if (!company) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="w-full p-0 flex flex-col"
          pinnable
          resizable
          defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
          onInteractOutside={(e) => {
            if (isEditing) e.preventDefault();
          }}
          defaultPinned={isEditing}
        >
          <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="factoring" /> : undefined}>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => pinMutation.mutate(isPinned ? null : company.id)}
                aria-label={isPinned ? 'Unpin factor' : 'Pin as factor'}
                aria-pressed={isPinned}
              >
                <Star className={`h-4 w-4 ${isPinned ? 'fill-foreground text-foreground' : 'text-muted-foreground'}`} />
              </Button>
              <SheetTitle className="text-lg truncate">{company.companyName}</SheetTitle>
            </div>
            <SheetDescription className="sr-only">Factoring company details for {company.companyName}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-1">
              {isEditing && saveError && (
                <Alert className="mb-4 bg-destructive/10 border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-sm">{saveError}</AlertDescription>
                </Alert>
              )}

              {/* 1. Company Info */}
              <SheetSection icon={Building2} title="Company Information">
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Company Name *</Label>
                      <Input
                        value={editForm.companyName}
                        onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                        autoFocus
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Contact Email</Label>
                        <Input
                          type="email"
                          value={editForm.contactEmail}
                          onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                          placeholder="payments@otr.com"
                        />
                      </div>
                      <div>
                        <Label>Contact Phone</Label>
                        <Input
                          value={editForm.contactPhone}
                          onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Remittance Address</Label>
                      <Textarea
                        rows={2}
                        value={editForm.remittanceAddress}
                        onChange={(e) => setEditForm({ ...editForm, remittanceAddress: e.target.value })}
                        placeholder="123 Factor St, Suite 100, Dallas, TX 75201"
                      />
                    </div>
                    <div>
                      <Label>Submission Email</Label>
                      <Input
                        type="email"
                        value={editForm.submissionEmail}
                        onChange={(e) => setEditForm({ ...editForm, submissionEmail: e.target.value })}
                        placeholder="submissions@factor.com"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Contact Email" value={company.contactEmail} icon={<Mail className="h-3 w-3" />} />
                    <InfoItem label="Contact Phone" value={company.contactPhone} icon={<Phone className="h-3 w-3" />} />
                    <InfoItem
                      label="Remittance Address"
                      value={company.remittanceAddress}
                      icon={<MapPin className="h-3 w-3" />}
                    />
                    <InfoItem
                      label="Submission Email"
                      value={company.submissionEmail}
                      icon={<FileText className="h-3 w-3" />}
                    />
                  </div>
                )}
              </SheetSection>

              {/* 2. Financial Terms */}
              <SheetSection icon={DollarSign} title="Financial Terms">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Advance Rate (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editForm.advanceRatePct}
                          onChange={(e) => setEditForm({ ...editForm, advanceRatePct: e.target.value })}
                          placeholder="95"
                        />
                      </div>
                      <div>
                        <Label>Fee Rate (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={editForm.feeRatePct}
                          onChange={(e) => setEditForm({ ...editForm, feeRatePct: e.target.value })}
                          placeholder="3.5"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Recourse Type</Label>
                      <Select
                        value={editForm.recourseType || 'none'}
                        onValueChange={(v) => setEditForm({ ...editForm, recourseType: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          <SelectItem value="RECOURSE">Recourse</SelectItem>
                          <SelectItem value="NON_RECOURSE">Non-Recourse</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use the ★ next to the company name to pin or unpin this as your tenant default.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem
                      label="Advance Rate"
                      value={company.advanceRatePct != null ? `${company.advanceRatePct}%` : undefined}
                    />
                    <InfoItem
                      label="Fee Rate"
                      value={company.feeRatePct != null ? `${company.feeRatePct}%` : undefined}
                    />
                    <InfoItem
                      label="Recourse Type"
                      value={
                        company.recourseType === 'NON_RECOURSE'
                          ? 'Non-Recourse'
                          : company.recourseType === 'RECOURSE'
                            ? 'Recourse'
                            : undefined
                      }
                    />
                  </div>
                )}
              </SheetSection>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {isEditing ? (
              <>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} loading={isSaving}>
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    initEditForm();
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {company.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This won&apos;t un-factor invoices already factored through this company. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" loading={deleteMutation.isPending} onClick={handleDelete}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
