'use client';

import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@sally/ui/components/ui/form-sheet';
import { Plus, Star, Building2, Search, X, Settings } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { USER_ROLES } from '@sally/shared-types';
import { useFactoringCompanies, useCreateFactoringCompany } from '../use-factoring';
import { useTenantFactoringDefault, usePinFactoringCompany } from '../use-tenant-factoring-default';
import { FactoringDetailSheet } from './factoring-detail-sheet';
import { FactoringSettingsSheet } from './factoring-settings-sheet';

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

interface CreateFormState {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  remittanceAddress: string;
  submissionEmail: string;
  advanceRatePct: string;
  feeRatePct: string;
  recourseType: string;
}

const EMPTY_FORM: CreateFormState = {
  companyName: '',
  contactEmail: '',
  contactPhone: '',
  remittanceAddress: '',
  submissionEmail: '',
  advanceRatePct: '',
  feeRatePct: '',
  recourseType: '',
};

interface FactoringCompaniesSectionProps {
  /** When the page toolbar hosts the Add/Settings actions, hide the inline header buttons. */
  actionsInToolbar?: boolean;
  /** Controlled create/settings dialogs (driven by the page toolbar CTAs). */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /** Reports whether the current user may edit settings, so the page can gate the Settings CTA. */
  onCanEditSettingsChange?: (canEdit: boolean) => void;
}

export function FactoringCompaniesSection({
  actionsInToolbar = false,
  createOpen: createOpenProp,
  onCreateOpenChange,
  settingsOpen: settingsOpenProp,
  onSettingsOpenChange,
  onCanEditSettingsChange,
}: FactoringCompaniesSectionProps = {}) {
  const { data: companies, isLoading } = useFactoringCompanies();
  const createMutation = useCreateFactoringCompany();
  const { data: tenantDefault } = useTenantFactoringDefault();
  const pinMutation = usePinFactoringCompany();
  const pinnedId = tenantDefault?.factoringCompanyId ?? null;

  const [selectedCompany, setSelectedCompany] = useState<FactoringCompany | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpenInternal, setCreateOpenInternal] = useState(false);
  const createOpen = createOpenProp ?? createOpenInternal;
  const setCreateOpen = onCreateOpenChange ?? setCreateOpenInternal;
  const [settingsOpenInternal, setSettingsOpenInternal] = useState(false);
  const settingsOpen = settingsOpenProp ?? settingsOpenInternal;
  const setSettingsOpen = onSettingsOpenChange ?? setSettingsOpenInternal;
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');

  const userRole = useAuthStore((s) => s.user?.role);
  const canEditSettings = userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.OWNER;

  // Let the page gate the toolbar Settings CTA on the same permission.
  useEffect(() => {
    onCanEditSettingsChange?.(canEditSettings);
  }, [canEditSettings, onCanEditSettingsChange]);

  const handleRowClick = (company: FactoringCompany) => {
    setSelectedCompany(company);
    setDetailOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.companyName.trim()) return;
    try {
      await createMutation.mutateAsync({
        companyName: createForm.companyName.trim(),
        contactEmail: createForm.contactEmail.trim() || undefined,
        contactPhone: createForm.contactPhone.trim() || undefined,
        remittanceAddress: createForm.remittanceAddress.trim() || undefined,
        submissionEmail: createForm.submissionEmail.trim() || undefined,
        advanceRatePct: createForm.advanceRatePct ? Number(createForm.advanceRatePct) : undefined,
        feeRatePct: createForm.feeRatePct ? Number(createForm.feeRatePct) : undefined,
        recourseType: createForm.recourseType || undefined,
      });
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    } catch {
      // Hook handles toasts
    }
  };

  const filteredCompanies = searchQuery.trim()
    ? (companies ?? []).filter((c: FactoringCompany) => {
        const q = searchQuery.toLowerCase();
        return (
          c.companyName?.toLowerCase().includes(q) ||
          c.contactEmail?.toLowerCase().includes(q) ||
          c.submissionEmail?.toLowerCase().includes(q)
        );
      })
    : (companies ?? []);

  return (
    <>
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search factoring companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9"
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
          {!actionsInToolbar && (
            <div className="flex items-center gap-2">
              {canEditSettings && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Factoring settings"
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2" />
            <p className="text-sm">{searchQuery ? 'No companies match your search' : 'No factoring companies yet'}</p>
            {!searchQuery && <p className="text-xs mt-1">Add one to start factoring invoices.</p>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" aria-label="Tenant default factor pin"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Advance Rate</TableHead>
                <TableHead className="hidden md:table-cell">Fee Rate</TableHead>
                <TableHead className="hidden lg:table-cell">Recourse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company: FactoringCompany) => {
                const isPinned = pinnedId === company.id;
                return (
                  <TableRow key={company.companyId} className="cursor-pointer" onClick={() => handleRowClick(company)}>
                    <TableCell className="w-10">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          pinMutation.mutate(isPinned ? null : company.id);
                        }}
                        aria-label={isPinned ? 'Unpin factor' : 'Pin as factor'}
                        aria-pressed={isPinned}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            isPinned ? 'fill-foreground text-foreground' : 'text-muted-foreground'
                          }`}
                        />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{company.companyName}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {company.contactEmail || company.contactPhone || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-foreground">
                      {company.advanceRatePct != null ? `${company.advanceRatePct}%` : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-foreground">
                      {company.feeRatePct != null ? `${company.feeRatePct}%` : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {company.recourseType ? (
                        <Badge variant="outline" className="text-xs">
                          {company.recourseType === 'NON_RECOURSE' ? 'Non-Recourse' : 'Recourse'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail sheet */}
      <FactoringDetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false);
        }}
        company={selectedCompany}
      />

      {/* Tenant-level factoring settings — gear icon opens this */}
      <FactoringSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-6 overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
        >
          <SheetHeader>
            <SheetTitle>Add Factoring Company</SheetTitle>
          </SheetHeader>
          <SheetKeyboardHint />

          <form onSubmit={handleCreateSubmit} className="mt-6 space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={createForm.companyName}
                onChange={(e) => setCreateForm({ ...createForm, companyName: e.target.value })}
                placeholder="OTR Solutions"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={createForm.contactEmail}
                  onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                  placeholder="payments@otr.com"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  value={createForm.contactPhone}
                  onChange={(e) => setCreateForm({ ...createForm, contactPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div>
              <Label>Remittance Address</Label>
              <Textarea
                rows={2}
                value={createForm.remittanceAddress}
                onChange={(e) => setCreateForm({ ...createForm, remittanceAddress: e.target.value })}
                placeholder="123 Factor St, Suite 100, Dallas, TX 75201"
              />
            </div>
            <div>
              <Label>Submission Email</Label>
              <Input
                type="email"
                value={createForm.submissionEmail}
                onChange={(e) => setCreateForm({ ...createForm, submissionEmail: e.target.value })}
                placeholder="submissions@factor.com"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Advance Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={createForm.advanceRatePct}
                  onChange={(e) => setCreateForm({ ...createForm, advanceRatePct: e.target.value })}
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
                  value={createForm.feeRatePct}
                  onChange={(e) => setCreateForm({ ...createForm, feeRatePct: e.target.value })}
                  placeholder="3.5"
                />
              </div>
            </div>
            <div>
              <Label>Recourse Type</Label>
              <Select
                value={createForm.recourseType || 'none'}
                onValueChange={(v) => setCreateForm({ ...createForm, recourseType: v === 'none' ? '' : v })}
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
              Pin this as your tenant default with the ★ icon in the list after saving.
            </p>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending} disabled={!createForm.companyName.trim()}>
                Create
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
