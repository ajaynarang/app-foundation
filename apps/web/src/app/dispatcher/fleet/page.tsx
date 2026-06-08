'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/features/auth';
import {
  listDrivers,
  createDriver,
  driversApi,
  InviteDriverDialog,
  DriverDetailSheet,
  getSourceLabel,
  isEldSource,
  type Driver,
  type CreateDriverRequest,
} from '@/features/fleet/drivers';
import { listVehicles, VehicleDetailSheet, EditVehicleSheet, type Vehicle } from '@/features/fleet/vehicles';
import {
  useTrailers,
  TrailerDetailSheet,
  CreateTrailerSheet,
  EditTrailerSheet,
  TrailerStatusBadge,
  type Trailer,
} from '@/features/fleet/trailers';
import {
  PageHeader,
  PageTabs,
  PageTabsList,
  PageTabsTrigger,
  PageToolbar,
  TabsContent,
  FilterBar,
  SegmentedControl,
} from '@/shared/components/page-chrome';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { useReferenceData } from '@/features/platform/reference-data';
import type { ReferenceItem } from '@/features/platform/reference-data';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Separator } from '@sally/ui/components/ui/separator';
import { ChevronDown, Plus, Package, AlertTriangle } from 'lucide-react';

import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { timeAgo } from '@/shared/lib/date-utils';
import { formatCalendarDate, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';

export default function FleetPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDriver, setInviteDriver] = useState<Driver | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  // Page owns the tab + add-dialog state so the primary CTA can live in the toolbar (Zone 2).
  const [activeFleetTab, setActiveFleetTab] = useState<'drivers' | 'assets'>('drivers');
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [trailerDialogOpen, setTrailerDialogOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { data: refData } = useReferenceData(['equipment_type', 'vehicle_status', 'us_state']);

  useEffect(() => {
    // Auth is handled by layout-client, just check role and load data
    if (isAuthenticated && user?.role !== 'DRIVER') {
      loadData();
    }
  }, [isAuthenticated, user]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [driversData, vehiclesData] = await Promise.all([listDrivers(true), listVehicles(true)]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteClick = (driver: Driver) => {
    setInviteDriver(driver);
    setInviteDialogOpen(true);
  };

  if (!isAuthenticated || user?.role === 'DRIVER') {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader title="Fleet" subtitle="Your drivers, trucks, and trailers" hasTabs />

        <PageTabs
          value={activeFleetTab}
          onValueChange={(v) => setActiveFleetTab(v as 'drivers' | 'assets')}
          className="space-y-4"
        >
          <PageToolbar
            tabs={
              <PageTabsList>
                <PageTabsTrigger value="drivers">Drivers</PageTabsTrigger>
                <PageTabsTrigger value="assets">Assets</PageTabsTrigger>
              </PageTabsList>
            }
            primaryAction={
              activeFleetTab === 'drivers' ? (
                <Button size="sm" onClick={() => setDriverDialogOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Driver</span>
                </Button>
              ) : (
                <Button size="sm" onClick={() => setVehicleDialogOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Vehicle</span>
                </Button>
              )
            }
            secondaryActions={
              activeFleetTab === 'assets' ? (
                <Button variant="outline" size="sm" onClick={() => setTrailerDialogOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Trailer</span>
                </Button>
              ) : undefined
            }
          />

          <TabsContent value="drivers">
            <DriversTab
              drivers={drivers}
              isLoading={isLoading}
              error={error}
              onRefresh={loadData}
              onInviteClick={handleInviteClick}
              addDialogOpen={driverDialogOpen}
              onAddDialogChange={setDriverDialogOpen}
            />
          </TabsContent>

          <TabsContent value="assets">
            <AssetsTab
              vehicles={vehicles}
              isLoading={isLoading}
              error={error}
              onRefresh={loadData}
              refData={refData}
              vehicleDialogOpen={vehicleDialogOpen}
              onVehicleDialogChange={setVehicleDialogOpen}
              trailerDialogOpen={trailerDialogOpen}
              onTrailerDialogChange={setTrailerDialogOpen}
            />
          </TabsContent>
        </PageTabs>

        <InviteDriverDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} driver={inviteDriver} />
      </div>
    </TooltipProvider>
  );
}

function DriversTab({
  drivers,
  isLoading,
  error,
  onRefresh,
  onInviteClick,
  addDialogOpen,
  onAddDialogChange,
}: {
  drivers: Driver[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onInviteClick?: (driver: Driver) => void;
  /** Add-driver dialog, controlled by the page (CTA lives in the toolbar). */
  addDialogOpen: boolean;
  onAddDialogChange: (open: boolean) => void;
}) {
  const [driverStatusFilter, setDriverStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [detailDriver, setDetailDriver] = useState<Driver | null>(null);

  // Deep-link: ?open=<driverId> → auto-open driver detail sheet
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open');
  useEffect(() => {
    if (!openParam) return;
    driversApi
      .getById(openParam)
      .then((driver) => {
        setDetailDriver(driver);
        const url = new URL(window.location.href);
        url.searchParams.delete('open');
        window.history.replaceState({}, '', url.toString());
      })
      .catch(() => {});
  }, [openParam]);

  const handleCreateSuccess = async () => {
    onAddDialogChange(false);
    await onRefresh();
  };
  const statusFilteredDrivers =
    driverStatusFilter === 'all'
      ? drivers
      : driverStatusFilter === 'active'
        ? drivers.filter((d) => d.status !== 'INACTIVE' && d.status !== 'REMOVED_FROM_SOURCE')
        : drivers.filter((d) => d.status === 'INACTIVE' || d.status === 'REMOVED_FROM_SOURCE');

  const filteredDrivers = driverSearchQuery.trim()
    ? statusFilteredDrivers.filter((d) => {
        const q = driverSearchQuery.toLowerCase();
        return (
          d.name?.toLowerCase().includes(q) || d.phone?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q)
        );
      })
    : statusFilteredDrivers;

  return (
    <div className="space-y-4">
      {/* Zone 3 — Filter bar (outside the card): status segmented control + search */}
      <FilterBar
        searchValue={driverSearchQuery}
        onSearchChange={setDriverSearchQuery}
        searchPlaceholder="Search by name, phone, or email..."
        searchClassName="w-full sm:w-72"
      >
        <SegmentedControl
          value={driverStatusFilter}
          onChange={setDriverStatusFilter}
          label="Driver status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
        />
      </FilterBar>

      {/* Zone 4 — Data */}
      <Card>
        {drivers.some((d) => d.externalSource) &&
          (() => {
            const hasEld = drivers.some((d) => d.externalSource && isEldSource(d.externalSource));
            const integrationLabel = hasEld ? 'ELD' : 'TMS';
            const sourceLabel = hasEld
              ? getSourceLabel(drivers.find((d) => d.externalSource && isEldSource(d.externalSource))!.externalSource!)
              : 'TMS';
            return (
              <div className="mx-6 mt-4 mb-2">
                <Alert className="bg-info/10 border-info/20">
                  <AlertDescription className="text-sm text-info">
                    <span className="font-medium">🔗 {integrationLabel} integration active</span> &mdash; Some drivers
                    are synced from {sourceLabel}. Operational fields can be edited locally.
                  </AlertDescription>
                </Alert>
              </div>
            );
          })()}

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-critical mb-4">{error}</p>
              <Button onClick={onRefresh}>Retry</Button>
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No drivers yet. Click &quot;Add Driver&quot; to add your first driver.
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No drivers match &quot;{driverSearchQuery}&quot;.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">HOS</TableHead>
                  <TableHead className="hidden lg:table-cell">Compliance</TableHead>
                  <TableHead className="hidden lg:table-cell">Vehicle</TableHead>
                  <TableHead className="hidden lg:table-cell">Integration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map((driver) => {
                  const drive = driver.currentHos?.driveRemaining ?? 11 - (driver.currentHoursDriven ?? 0);
                  const shift = driver.currentHos?.shiftRemaining ?? 14 - (driver.currentOnDutyTime ?? 0);
                  const cycle = driver.currentHos?.cycleRemaining ?? 70 - (driver.cycleHoursUsed ?? 0);
                  const breakH = 8 - (driver.currentHoursSinceBreak ?? 0);
                  const clocks = [
                    { label: 'D', remaining: drive, max: 11 },
                    { label: 'S', remaining: shift, max: 14 },
                    { label: 'C', remaining: cycle, max: 70 },
                    { label: 'B', remaining: breakH, max: 8 },
                  ];
                  const hosClockColor = (remaining: number, max: number) => {
                    const p = Math.max(0, (remaining / max) * 100);
                    return p < 10 ? 'text-critical' : p < 25 ? 'text-caution' : 'text-muted-foreground';
                  };
                  const hasAnyCritical = clocks.some((c) => c.remaining / c.max < 0.1);

                  return (
                    <TableRow
                      key={driver.id}
                      className={`cursor-pointer ${
                        driver.status === 'INACTIVE' || driver.status === 'REMOVED_FROM_SOURCE' ? 'opacity-50' : ''
                      }`}
                      onClick={() => setDetailDriver(driver)}
                    >
                      {/* Driver Name */}
                      <TableCell>
                        <div>
                          <span className="font-medium text-foreground">{driver.name}</span>
                          {driver.phone && <div className="text-sm text-muted-foreground">{driver.phone}</div>}
                        </div>
                      </TableCell>
                      {/* Status + SALLY */}
                      <TableCell>
                        <div>
                          <Badge
                            variant={
                              driver.status === 'ACTIVE'
                                ? 'default'
                                : driver.status === 'INACTIVE'
                                  ? 'muted'
                                  : 'outline'
                            }
                          >
                            {driver.status || 'Unknown'}
                          </Badge>
                          {driver.status !== 'INACTIVE' &&
                            driver.status !== 'SUSPENDED' &&
                            driver.status !== 'REMOVED_FROM_SOURCE' && (
                              <div className="flex items-center gap-1 mt-1">
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    driver.sallyAccessStatus === 'ACTIVE'
                                      ? 'bg-muted-foreground'
                                      : driver.sallyAccessStatus === 'INVITED'
                                        ? 'bg-accent'
                                        : driver.sallyAccessStatus === 'DEACTIVATED'
                                          ? 'bg-critical'
                                          : 'bg-muted-foreground'
                                  }`}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {driver.sallyAccessStatus === 'ACTIVE'
                                    ? 'SALLY Active'
                                    : driver.sallyAccessStatus === 'INVITED'
                                      ? 'SALLY Invited'
                                      : driver.sallyAccessStatus === 'DEACTIVATED'
                                        ? 'SALLY Off'
                                        : 'No SALLY'}
                                </span>
                              </div>
                            )}
                        </div>
                      </TableCell>
                      {/* HOS — 2×2 grid showing all clocks */}
                      <TableCell className="hidden md:table-cell">
                        {driver.currentHos || driver.hosDataSource ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs font-mono min-w-[120px]">
                                  {clocks.map((c) => (
                                    <span key={c.label} className={hosClockColor(c.remaining, c.max)}>
                                      {c.label} {c.remaining.toFixed(1)}h
                                    </span>
                                  ))}
                                </div>
                                {hasAnyCritical && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-critical flex-shrink-0" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                <p>Drive: {drive.toFixed(1)}h remaining</p>
                                <p>Shift: {shift.toFixed(1)}h remaining</p>
                                <p>Cycle: {cycle.toFixed(1)}h remaining</p>
                                <p>Break: {breakH.toFixed(1)}h remaining</p>
                                {driver.hosDataSyncedAt && (
                                  <p className="text-muted-foreground">Synced {timeAgo(driver.hosDataSyncedAt)}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">No HOS</span>
                        )}
                      </TableCell>
                      {/* Compliance */}
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm">
                          {driver.cdlClass && (
                            <Badge variant="outline" className="mr-1">
                              Class {driver.cdlClass}
                            </Badge>
                          )}
                          {driver.licenseNumber ? (
                            <span className="text-foreground">{driver.licenseNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">No License</span>
                          )}
                          {driver.medicalCardExpiry && (
                            <div className="text-xs text-muted-foreground">
                              Med: {formatCalendarDate(driver.medicalCardExpiry, DISPLAY_FORMATS.COMPACT)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {/* Vehicle */}
                      <TableCell className="hidden lg:table-cell text-sm">
                        {driver.assignedVehicle ? (
                          <span className="text-muted-foreground">{driver.assignedVehicle.unitNumber}</span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      {/* Integration */}
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {driver.externalSource ? getSourceLabel(driver.externalSource) : 'Manual'}
                          </Badge>
                          <Tooltip>
                            <TooltipTrigger>
                              <span
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                className={`text-2xs ${(driver.eldMetadata as any)?.eldId ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                              >
                                ●
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(driver.eldMetadata as any)?.eldId ? 'ELD Linked' : 'ELD Not Linked'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FormSheet
        open={addDialogOpen}
        onOpenChange={onAddDialogChange}
        title="Add Driver"
        mode="edit"
        entityType="driver"
      >
        <DriverForm onSuccess={handleCreateSuccess} onCancel={() => onAddDialogChange(false)} />
      </FormSheet>

      <DriverDetailSheet
        open={!!detailDriver}
        onOpenChange={(open) => {
          if (!open) setDetailDriver(null);
        }}
        driver={detailDriver}
        onMutate={onRefresh}
        onInviteClick={onInviteClick}
      />
    </div>
  );
}

function DriverForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { data: refData } = useReferenceData(['cdl_class', 'us_state', 'endorsement']);
  const cdlClasses = refData?.cdl_class ?? [];
  const usStates = refData?.us_state ?? [];
  const endorsementOptions = refData?.endorsement ?? [];

  const [formData, setFormData] = useState<CreateDriverRequest>({
    name: '',
    phone: '',
    email: '',
    cdlClass: 'A',
    licenseNumber: '',
    licenseState: '',
    endorsements: [],
    hireDate: '',
    medicalCardExpiry: '',
    homeTerminalCity: '',
    homeTerminalState: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | null>>({});
  const [showMore, setShowMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const phone = formData.phone?.trim();
    const email = formData.email?.trim();
    if (!phone && !email) {
      setError('At least one of phone or email is required.');
      setIsSubmitting(false);
      return;
    }

    try {
      const filteredCustomFields = Object.fromEntries(
        Object.entries(customFieldValues).filter(([, v]) => v != null && v !== ''),
      );
      const payload: CreateDriverRequest = {
        ...formData,
        phone: phone || undefined,
        email: email || undefined,
        licenseState: formData.licenseState?.trim() || undefined,
        hireDate: formData.hireDate?.trim() || undefined,
        medicalCardExpiry: formData.medicalCardExpiry?.trim() || undefined,
        homeTerminalCity: formData.homeTerminalCity?.trim() || undefined,
        homeTerminalState: formData.homeTerminalState?.trim() || undefined,
        emergencyContactName: formData.emergencyContactName?.trim() || undefined,
        emergencyContactPhone: formData.emergencyContactPhone?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        endorsements: formData.endorsements?.length ? formData.endorsements : undefined,
        ...(Object.keys(filteredCustomFields).length > 0 ? { customFieldValues: filteredCustomFields } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      await createDriver(payload);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create driver');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndorsementToggle = (value: string) => {
    const current = formData.endorsements || [];
    if (current.includes(value)) {
      setFormData({
        ...formData,
        endorsements: current.filter((e) => e !== value),
      });
    } else {
      setFormData({ ...formData, endorsements: [...current, value] });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground text-xs">(optional if email provided)</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="email">
          Email <span className="text-muted-foreground text-xs">(optional if phone provided)</span>
        </Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cdl_class">CDL Class *</Label>
          <Select
            value={formData.cdlClass}
            onValueChange={(value) => setFormData({ ...formData, cdlClass: value as 'A' | 'B' | 'C' })}
          >
            <SelectTrigger id="cdl_class">
              <SelectValue placeholder="Select CDL class" />
            </SelectTrigger>
            <SelectContent>
              {cdlClasses.map((cdl) => (
                <SelectItem key={cdl.code} value={cdl.code}>
                  {cdl.label} &mdash; {cdl.metadata?.description || ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="license">License Number *</Label>
          <Input
            id="license"
            value={formData.licenseNumber}
            onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="license_state">License State</Label>
          <Select
            value={formData.licenseState || ''}
            onValueChange={(value) => setFormData({ ...formData, licenseState: value })}
          >
            <SelectTrigger id="license_state">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {usStates.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.label} ({state.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Collapsible open={showMore} onOpenChange={setShowMore}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
          >
            More Details
            <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          {/* Endorsements */}
          <div>
            <Label>Endorsements</Label>
            <div className="flex flex-wrap gap-4 mt-2">
              {endorsementOptions.map((opt) => (
                <div key={opt.code} className="flex items-center gap-2">
                  <Checkbox
                    id={`create-endorsement-${opt.code}`}
                    checked={(formData.endorsements || []).includes(opt.code)}
                    onCheckedChange={() => handleEndorsementToggle(opt.code)}
                  />
                  <Label htmlFor={`create-endorsement-${opt.code}`} className="text-sm font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Compliance Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create-hire-date">Hire Date</Label>
              <Input
                id="create-hire-date"
                type="date"
                value={formData.hireDate || ''}
                onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="create-medical">Medical Card Expiry</Label>
              <Input
                id="create-medical"
                type="date"
                value={formData.medicalCardExpiry || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    medicalCardExpiry: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <Separator />

          {/* Home Terminal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create-city">Home Terminal City</Label>
              <Input
                id="create-city"
                value={formData.homeTerminalCity || ''}
                onChange={(e) => setFormData({ ...formData, homeTerminalCity: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="create-terminal-state">Home Terminal State</Label>
              <Select
                value={formData.homeTerminalState || ''}
                onValueChange={(value) => setFormData({ ...formData, homeTerminalState: value })}
              >
                <SelectTrigger id="create-terminal-state">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {usStates.map((state) => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.label} ({state.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Emergency Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create-ec-name">Emergency Contact Name</Label>
              <Input
                id="create-ec-name"
                value={formData.emergencyContactName || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emergencyContactName: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="create-ec-phone">Emergency Contact Phone</Label>
              <Input
                id="create-ec-phone"
                type="tel"
                value={formData.emergencyContactPhone || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emergencyContactPhone: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div>
            <Label htmlFor="create-notes">Notes</Label>
            <Textarea
              id="create-notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Add notes about this driver..."
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Custom Fields */}
      <CustomFieldsSection entityType="DRIVER" values={customFieldValues} onChange={setCustomFieldValues} mode="edit" />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.includes(',') ? (
              <ul className="list-disc list-inside space-y-1">
                {error.split(',').map((msg, i) => (
                  <li key={i}>{msg.trim()}</li>
                ))}
              </ul>
            ) : (
              error
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Create
        </Button>
      </div>
    </form>
  );
}

function AssetsTab({
  vehicles,
  isLoading,
  error,
  onRefresh,
  refData,
  vehicleDialogOpen,
  onVehicleDialogChange,
  trailerDialogOpen,
  onTrailerDialogChange,
}: {
  vehicles: Vehicle[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  refData?: Record<string, ReferenceItem[]>;
  /** Add-vehicle/add-trailer create dialogs, controlled by the page toolbar CTAs. */
  vehicleDialogOpen: boolean;
  onVehicleDialogChange: (open: boolean) => void;
  trailerDialogOpen: boolean;
  onTrailerDialogChange: (open: boolean) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'trucks' | 'trailers'>('trucks');
  // Vehicle CREATE dialog is page-controlled; edit uses editingVehicle below.
  const isDialogOpen = vehicleDialogOpen;
  const setIsDialogOpen = onVehicleDialogChange;
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleLifecycleFilter, setVehicleLifecycleFilter] = useState<
    'all' | 'active' | 'inactive' | 'decommissioned'
  >('active');
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);

  // Trailer state
  const { data: trailers = [], isLoading: trailersLoading } = useTrailers(true);
  const [trailerLifecycleFilter, setTrailerLifecycleFilter] = useState<
    'all' | 'active' | 'inactive' | 'decommissioned'
  >('active');
  const [trailerSearchQuery, setTrailerSearchQuery] = useState('');
  const [selectedTrailer, setSelectedTrailer] = useState<Trailer | null>(null);
  // Trailer CREATE dialog is page-controlled (Add Trailer CTA in the toolbar).
  const createTrailerOpen = trailerDialogOpen;
  const setCreateTrailerOpen = onTrailerDialogChange;
  const [editTrailerOpen, setEditTrailerOpen] = useState(false);
  const [trailerDetailOpen, setTrailerDetailOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<Trailer | null>(null);

  const lifecycleFilteredTrailers =
    trailerLifecycleFilter === 'all'
      ? trailers
      : trailerLifecycleFilter === 'active'
        ? trailers.filter((t) => t.lifecycleStatus !== 'INACTIVE' && t.lifecycleStatus !== 'DECOMMISSIONED')
        : trailerLifecycleFilter === 'decommissioned'
          ? trailers.filter((t) => t.lifecycleStatus === 'DECOMMISSIONED')
          : trailers.filter((t) => t.lifecycleStatus === 'INACTIVE');

  const filteredTrailers = trailerSearchQuery.trim()
    ? lifecycleFilteredTrailers.filter((t) => {
        const q = trailerSearchQuery.toLowerCase();
        return (
          t.unitNumber?.toLowerCase().includes(q) ||
          t.vin?.toLowerCase().includes(q) ||
          t.licensePlate?.toLowerCase().includes(q)
        );
      })
    : lifecycleFilteredTrailers;

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingVehicle(null);
  };

  const handleSuccess = async () => {
    handleCloseDialog();
    await onRefresh();
  };

  const lifecycleFilteredVehicles =
    vehicleLifecycleFilter === 'all'
      ? vehicles
      : vehicleLifecycleFilter === 'active'
        ? vehicles.filter((v) => v.lifecycleStatus !== 'INACTIVE' && v.lifecycleStatus !== 'DECOMMISSIONED')
        : vehicleLifecycleFilter === 'decommissioned'
          ? vehicles.filter((v) => v.lifecycleStatus === 'DECOMMISSIONED')
          : vehicles.filter((v) => v.lifecycleStatus === 'INACTIVE');

  const filteredVehicles = vehicleSearchQuery.trim()
    ? lifecycleFilteredVehicles.filter((v) => {
        const q = vehicleSearchQuery.toLowerCase();
        return v.unitNumber?.toLowerCase().includes(q) || v.vin?.toLowerCase().includes(q);
      })
    : lifecycleFilteredVehicles;

  return (
    <div className="space-y-4">
      {/* Zone 3 — Filter bar (one row): Trucks/Trailers sub-tab · search · lifecycle status */}
      <FilterBar
        searchValue={activeSubTab === 'trucks' ? vehicleSearchQuery : trailerSearchQuery}
        onSearchChange={activeSubTab === 'trucks' ? setVehicleSearchQuery : setTrailerSearchQuery}
        searchPlaceholder={
          activeSubTab === 'trucks' ? 'Search by unit number or VIN...' : 'Search by unit #, VIN, or plate...'
        }
        searchClassName="w-full sm:w-72"
      >
        <SegmentedControl
          value={activeSubTab}
          onChange={setActiveSubTab}
          label="Asset type"
          options={[
            { value: 'trucks', label: 'Trucks', icon: Package },
            { value: 'trailers', label: 'Trailers', icon: Package },
          ]}
        />
        <SegmentedControl
          value={activeSubTab === 'trucks' ? vehicleLifecycleFilter : trailerLifecycleFilter}
          onChange={activeSubTab === 'trucks' ? setVehicleLifecycleFilter : setTrailerLifecycleFilter}
          label="Lifecycle status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'decommissioned', label: 'Decommissioned', shortLabel: 'Decom.' },
            { value: 'all', label: 'All' },
          ]}
        />
      </FilterBar>

      {/* Zone 4 — Data */}
      <Card>
        {activeSubTab === 'trucks' &&
          vehicles.some((v) => v.externalSource) &&
          (() => {
            const hasEld = vehicles.some((v) => v.externalSource && isEldSource(v.externalSource));
            const integrationLabel = hasEld ? 'ELD' : 'TMS';
            const sourceLabel = hasEld
              ? getSourceLabel(vehicles.find((v) => v.externalSource && isEldSource(v.externalSource))!.externalSource!)
              : 'TMS';
            return (
              <div className="mx-6 mt-2 mb-2">
                <Alert className="bg-info/10 border-info/20">
                  <AlertDescription className="text-sm text-info">
                    <span className="font-medium">🔗 {integrationLabel} integration active</span> &mdash; Some trucks
                    are synced from {sourceLabel}. Operational fields can be edited locally.
                  </AlertDescription>
                </Alert>
              </div>
            );
          })()}

        <CardContent>
          {activeSubTab === 'trucks' && (
            <>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-critical mb-4">{error}</p>
                  <Button onClick={onRefresh}>Retry</Button>
                </div>
              ) : vehicles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No trucks yet. Click &quot;Add Truck&quot; to add your first truck.
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No trucks match &quot;{vehicleSearchQuery}&quot;.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden md:table-cell">Make/Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Telematics</TableHead>
                      <TableHead className="hidden lg:table-cell">Driver</TableHead>
                      <TableHead className="hidden lg:table-cell">Integration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVehicles.map((vehicle) => (
                      <TableRow
                        key={vehicle.id}
                        className={`cursor-pointer ${
                          vehicle.lifecycleStatus === 'INACTIVE' || vehicle.lifecycleStatus === 'DECOMMISSIONED'
                            ? 'opacity-50'
                            : ''
                        }`}
                        onClick={() => setDetailVehicle(vehicle)}
                      >
                        <TableCell>
                          <span className="font-medium text-foreground">{vehicle.unitNumber}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {formatEquipmentType(vehicle.equipmentType, refData)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-foreground">
                          {vehicle.make && vehicle.model
                            ? `${vehicle.make} ${vehicle.model}`
                            : vehicle.make || vehicle.model || '—'}
                        </TableCell>
                        <TableCell>
                          <VehicleStatusBadge status={vehicle.status} refData={refData} />
                        </TableCell>
                        {/* Telematics */}
                        <TableCell className="hidden md:table-cell">
                          {vehicle.telematics ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5">
                                  {vehicle.telematics.latitude !== 0 && vehicle.telematics.longitude !== 0 ? (
                                    <span className="text-xs text-foreground truncate max-w-[100px]">
                                      {vehicle.telematics.latitude.toFixed(2)},{' '}
                                      {vehicle.telematics.longitude.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No GPS</span>
                                  )}
                                  <span
                                    className={`text-2xs ${vehicle.telematics.engineRunning ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                                  >
                                    ●
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-1">
                                  {vehicle.telematics.latitude !== 0 && (
                                    <p>
                                      Location: {vehicle.telematics.latitude.toFixed(4)},{' '}
                                      {vehicle.telematics.longitude.toFixed(4)}
                                    </p>
                                  )}
                                  <p>
                                    Speed:{' '}
                                    {vehicle.telematics.speed > 0
                                      ? `${vehicle.telematics.speed.toFixed(0)} mph`
                                      : 'Parked'}
                                  </p>
                                  <p>Engine: {vehicle.telematics.engineRunning ? 'Running' : 'Off'}</p>
                                  {vehicle.telematics.odometer > 0 && (
                                    <p>Odometer: {vehicle.telematics.odometer.toFixed(0)} mi</p>
                                  )}
                                  {vehicle.telematics.fuelLevel != null && (
                                    <p>Fuel: {vehicle.telematics.fuelLevel.toFixed(0)}%</p>
                                  )}
                                  {vehicle.telematics.timestamp && (
                                    <p className="text-muted-foreground">
                                      Updated {timeAgo(vehicle.telematics.timestamp)}
                                    </p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">&mdash;</span>
                          )}
                        </TableCell>
                        {/* Driver */}
                        <TableCell className="hidden lg:table-cell text-sm">
                          {vehicle.assignedDriver ? (
                            <span className="text-muted-foreground">{vehicle.assignedDriver.name}</span>
                          ) : (
                            <span className="text-muted-foreground">&mdash;</span>
                          )}
                        </TableCell>
                        {/* Integration */}
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              {vehicle.externalSource ? getSourceLabel(vehicle.externalSource) : 'Manual'}
                            </Badge>
                            <Tooltip>
                              <TooltipTrigger>
                                <span
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  className={`text-2xs ${(vehicle.eldTelematicsMetadata as any)?.eldId ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                                >
                                  ●
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {(vehicle.eldTelematicsMetadata as any)?.eldId ? 'ELD Linked' : 'ELD Not Linked'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {activeSubTab === 'trailers' && (
            <>
              {trailersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : trailers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No trailers yet. Click &quot;Add Trailer&quot; to add your first trailer.
                </div>
              ) : filteredTrailers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No trailers match &quot;{trailerSearchQuery}&quot;.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">VIN</TableHead>
                      <TableHead className="hidden md:table-cell">License Plate</TableHead>
                      <TableHead className="hidden lg:table-cell">Hooked To</TableHead>
                      <TableHead className="hidden lg:table-cell">Length</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrailers.map((trailer) => (
                      <TableRow
                        key={trailer.id}
                        className={`cursor-pointer ${
                          trailer.lifecycleStatus === 'INACTIVE' || trailer.lifecycleStatus === 'DECOMMISSIONED'
                            ? 'opacity-50'
                            : ''
                        }`}
                        onClick={() => {
                          setSelectedTrailer(trailer);
                          setTrailerDetailOpen(true);
                        }}
                      >
                        <TableCell>
                          <span className="font-medium text-foreground">{trailer.unitNumber}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {trailer.equipmentType?.replace(/_/g, ' ') || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TrailerStatusBadge status={trailer.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-foreground font-mono text-xs">
                          {trailer.vin || '\u2014'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-foreground">
                          {trailer.licensePlate
                            ? `${trailer.licensePlate}${trailer.licensePlateState ? ` (${trailer.licensePlateState})` : ''}`
                            : '\u2014'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {trailer.assignedVehicle ? (
                            <span className="text-muted-foreground">Unit #{trailer.assignedVehicle.unitNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-foreground">
                          {trailer.lengthFeet ? `${trailer.lengthFeet} ft` : '\u2014'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <EditVehicleSheet
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
        }}
        vehicle={editingVehicle}
        onSuccess={handleSuccess}
      />

      <VehicleDetailSheet
        open={!!detailVehicle}
        onOpenChange={(open) => {
          if (!open) setDetailVehicle(null);
        }}
        vehicle={detailVehicle}
        onMutate={onRefresh}
      />

      <TrailerDetailSheet
        open={trailerDetailOpen}
        onOpenChange={(open) => {
          setTrailerDetailOpen(open);
          if (!open) setSelectedTrailer(null);
        }}
        trailer={selectedTrailer}
        onMutate={onRefresh}
        onEdit={(trailer) => {
          setEditingTrailer(trailer);
          setTrailerDetailOpen(false);
          setEditTrailerOpen(true);
        }}
      />

      <CreateTrailerSheet open={createTrailerOpen} onOpenChange={setCreateTrailerOpen} onSuccess={onRefresh} />

      <EditTrailerSheet
        open={editTrailerOpen}
        onOpenChange={(open) => {
          setEditTrailerOpen(open);
          if (!open) setEditingTrailer(null);
        }}
        trailer={editingTrailer}
        onSuccess={onRefresh}
      />
    </div>
  );
}

function VehicleStatusBadge({ status, refData }: { status: string; refData?: Record<string, ReferenceItem[]> }) {
  const statusItem = refData?.vehicle_status?.find((item) => item.code === status);
  const label = statusItem?.label || status;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const color = (statusItem?.metadata as any)?.color;

  const colorClasses: Record<string, string> = {
    green: 'border-border text-muted-foreground',
    blue: 'bg-info/10 text-info border-transparent',
    amber: 'border-caution/20 text-caution',
    red: 'border-critical/20 text-critical',
  };

  if (color === 'blue') {
    return <Badge className={colorClasses[color]}>{label}</Badge>;
  }

  return (
    <Badge variant="outline" className={colorClasses[color] || ''}>
      {label}
    </Badge>
  );
}

function formatEquipmentType(type: string, refData?: Record<string, ReferenceItem[]>): string {
  const item = refData?.equipment_type?.find((item) => item.code === type);
  if (item) return item.label;
  const labels: Record<string, string> = {
    DRY_VAN: 'Dry Van',
    FLATBED: 'Flatbed',
    REEFER: 'Reefer',
    STEP_DECK: 'Step Deck',
    POWER_ONLY: 'Power Only',
    OTHER: 'Other',
  };
  return labels[type] || type;
}
