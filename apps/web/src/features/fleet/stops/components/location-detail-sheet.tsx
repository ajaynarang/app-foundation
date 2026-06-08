'use client';

import { useState, useEffect, useCallback } from 'react';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { Button } from '@sally/ui/components/ui/button';

import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Switch } from '@sally/ui/components/ui/switch';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useLocationById, useUpdateLocation } from '../hooks/use-locations';
import { LOCATION_TYPES, LOCATION_TYPE_LABELS } from '../constants';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { Pencil, MapPin, Phone, Mail, User, Settings, FileText, Package, AlertCircle } from 'lucide-react';

interface Props {
  locationId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditFormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  locationType: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  appointmentRequired: boolean;
  notes: string;
}

export function LocationDetailSheet({ locationId, open, onOpenChange }: Props) {
  const { data: location, isLoading } = useLocationById(locationId);
  const updateMutation = useUpdateLocation();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    locationType: 'WAREHOUSE',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    appointmentRequired: false,
    notes: '',
  });

  // Reset edit state when location changes
  useEffect(() => {
    setIsEditing(false);
  }, [locationId]);

  const initEditForm = useCallback(() => {
    if (!location) return;
    setSaveError(null);
    setEditForm({
      name: location.name || '',
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      zipCode: location.zipCode || '',
      locationType: location.locationType || 'WAREHOUSE',
      contactName: location.contactName || '',
      contactPhone: location.contactPhone || '',
      contactEmail: location.contactEmail || '',
      appointmentRequired: location.appointmentRequired || false,
      notes: location.notes || '',
    });
  }, [location]);

  const handleSave = async () => {
    if (!locationId) return;
    if (!editForm.name.trim()) {
      setSaveError('Location name is required');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: locationId,
        data: {
          name: editForm.name.trim(),
          address: editForm.address.trim() || undefined,
          city: editForm.city.trim() || undefined,
          state: editForm.state || undefined,
          zipCode: editForm.zipCode.trim() || undefined,
          locationType: editForm.locationType,
          contactName: editForm.contactName.trim() || undefined,
          contactPhone: editForm.contactPhone.trim() || undefined,
          contactEmail: editForm.contactEmail.trim() || undefined,
          appointmentRequired: editForm.appointmentRequired,
          notes: editForm.notes.trim() || undefined,
        },
      });
      setIsEditing(false);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const mode = isEditing ? 'edit' : 'view';

  const title = isLoading ? 'Loading...' : (location?.name ?? 'Location');

  const viewFooterExtra =
    !isLoading && location && !isEditing ? (
      <>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => {
            initEditForm();
            setIsEditing(true);
          }}
        >
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      </>
    ) : undefined;

  if (!open) return null;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={location ? `Location details for ${location.name}` : undefined}
      mode={mode}
      onSubmit={handleSave}
      onCancel={handleCancel}
      submitLabel="Save Changes"
      isSubmitting={isSaving}
      entityType="location"
      pinnable={isEditing}
      resizable
      footerExtra={viewFooterExtra}
    >
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : location ? (
        <div className="space-y-1">
          {isEditing && saveError && (
            <Alert className="mb-4 bg-destructive/10 border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm">{saveError}</AlertDescription>
            </Alert>
          )}
          {/* 1. Location Details */}
          <SheetSection icon={MapPin} title="Location Details">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Walmart DC #4523"
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>City</Label>
                    <Input
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      placeholder="Dallas"
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input
                      value={editForm.state}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      placeholder="TX"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Label>ZIP</Label>
                    <Input
                      value={editForm.zipCode}
                      onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                      placeholder="75201"
                      maxLength={10}
                    />
                  </div>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={editForm.locationType}
                    onValueChange={(v) => setEditForm({ ...editForm, locationType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem
                  label="Address"
                  value={
                    location.address
                      ? `${location.address}${location.city ? `, ${location.city}` : ''}${location.state ? `, ${location.state}` : ''}${location.zipCode ? ` ${location.zipCode}` : ''}`
                      : undefined
                  }
                  icon={<MapPin className="h-3 w-3" />}
                />
                <InfoItem label="Type" value={LOCATION_TYPE_LABELS[location.locationType] || location.locationType} />
              </div>
            )}
          </SheetSection>

          {/* 2. Facility Contact */}
          <SheetSection icon={User} title="Facility Contact">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contact Name</Label>
                    <Input
                      value={editForm.contactName}
                      onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={editForm.contactPhone}
                      onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={editForm.contactEmail}
                    onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                    placeholder="receiving@facility.com"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Contact Name" value={location.contactName} icon={<User className="h-3 w-3" />} />
                <InfoItem label="Phone" value={location.contactPhone} icon={<Phone className="h-3 w-3" />} />
                <InfoItem label="Email" value={location.contactEmail} icon={<Mail className="h-3 w-3" />} />
              </div>
            )}
          </SheetSection>

          {/* 3. Operations */}
          <SheetSection icon={Settings} title="Operations">
            {isEditing ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Appointment Required</Label>
                    <p className="text-xs text-muted-foreground">Drivers must schedule appointments at this facility</p>
                  </div>
                  <Switch
                    checked={editForm.appointmentRequired}
                    onCheckedChange={(v) => setEditForm({ ...editForm, appointmentRequired: v })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Appointment Required" value={location.appointmentRequired ? 'Yes' : 'No'} />
              </div>
            )}
          </SheetSection>

          {/* 4. Notes */}
          <SheetSection icon={FileText} title="Notes" defaultOpen={!!location.notes}>
            {isEditing ? (
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Gate codes, dock instructions, special requirements..."
                rows={3}
              />
            ) : location.notes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{location.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </SheetSection>

          {/* 5. Usage Stats — view mode only */}
          {!isEditing && location.loadCount != null && (
            <SheetSection icon={Package} title="Usage" defaultOpen={false}>
              <InfoItem label="Used in Loads" value={location.loadCount.toString()} />
            </SheetSection>
          )}
        </div>
      ) : null}
    </FormSheet>
  );
}
