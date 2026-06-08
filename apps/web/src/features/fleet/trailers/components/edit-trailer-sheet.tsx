'use client';

import { useState, useEffect } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useUpdateTrailer } from '../hooks/use-trailers';
import type { Trailer, UpdateTrailerRequest } from '../types';
import { Truck, Ruler, Snowflake, Shield, FileText } from 'lucide-react';

const TRAILER_EQUIPMENT_TYPES = [
  { value: 'DRY_VAN', label: 'Dry Van' },
  { value: 'FLATBED', label: 'Flatbed' },
  { value: 'REEFER', label: 'Reefer' },
  { value: 'STEP_DECK', label: 'Step Deck' },
  { value: 'OTHER', label: 'Other' },
];

const OWNERSHIP_TYPES = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'LEASED', label: 'Leased' },
  { value: 'OWNER_OPERATOR', label: 'Owner-Operator' },
];

const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

interface EditTrailerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trailer: Trailer | null;
  onSuccess?: () => void;
}

export default function EditTrailerSheet({ open, onOpenChange, trailer, onSuccess }: EditTrailerSheetProps) {
  const updateTrailer = useUpdateTrailer();
  const [showSuccessState, setShowSuccessState] = useState(false);

  const [formData, setFormData] = useState<Partial<UpdateTrailerRequest>>({});

  // Reset form when trailer/open changes
  useEffect(() => {
    if (trailer && open) {
      setFormData({
        unitNumber: trailer.unitNumber || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        equipmentType: (trailer.equipmentType as any) || undefined,
        vin: trailer.vin || '',
        licensePlate: trailer.licensePlate || '',
        licensePlateState: trailer.licensePlateState || '',
        make: trailer.make || '',
        model: trailer.model || '',
        year: trailer.year || undefined,
        lengthFeet: trailer.lengthFeet || undefined,
        maxPayloadLbs: trailer.maxPayloadLbs || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ownershipType: (trailer.ownershipType as any) || undefined,
        reeferMake: trailer.reeferMake || '',
        reeferModel: trailer.reeferModel || '',
        reeferSerial: trailer.reeferSerial || '',
        registrationExpiry: trailer.registrationExpiry ? trailer.registrationExpiry.split('T')[0] : '',
        insuranceExpiry: trailer.insuranceExpiry ? trailer.insuranceExpiry.split('T')[0] : '',
        annualInspectionDate: trailer.annualInspectionDate ? trailer.annualInspectionDate.split('T')[0] : '',
        nextMaintenanceDate: trailer.nextMaintenanceDate ? trailer.nextMaintenanceDate.split('T')[0] : '',
        notes: trailer.notes || '',
      });
    }
  }, [trailer, open]);

  const handleSubmit = () => {
    if (!trailer) return;

    const payload: UpdateTrailerRequest = {
      unitNumber: formData.unitNumber?.trim() || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      equipmentType: (formData.equipmentType as any) || undefined,
      vin: formData.vin?.trim() || undefined,
      licensePlate: formData.licensePlate?.trim() || undefined,
      licensePlateState: formData.licensePlateState || undefined,
      make: formData.make?.trim() || undefined,
      model: formData.model?.trim() || undefined,
      year: formData.year || undefined,
      lengthFeet: formData.lengthFeet || undefined,
      maxPayloadLbs: formData.maxPayloadLbs || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ownershipType: (formData.ownershipType as any) || undefined,
      reeferMake: formData.equipmentType === 'REEFER' ? formData.reeferMake?.trim() || undefined : undefined,
      reeferModel: formData.equipmentType === 'REEFER' ? formData.reeferModel?.trim() || undefined : undefined,
      reeferSerial: formData.equipmentType === 'REEFER' ? formData.reeferSerial?.trim() || undefined : undefined,
      registrationExpiry: formData.registrationExpiry?.trim() || undefined,
      insuranceExpiry: formData.insuranceExpiry?.trim() || undefined,
      annualInspectionDate: formData.annualInspectionDate?.trim() || undefined,
      nextMaintenanceDate: formData.nextMaintenanceDate?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    };

    updateTrailer.mutate(
      { trailerId: trailer.trailerId, data: payload },
      {
        onSuccess: () => {
          setShowSuccessState(true);
          setTimeout(() => {
            setShowSuccessState(false);
            onOpenChange(false);
            onSuccess?.();
          }, 500);
        },
      },
    );
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else onOpenChange(newOpen);
      }}
      title={`Edit Trailer ${trailer?.unitNumber || ''}`}
      mode="edit"
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      submitLabel="Update"
      isSubmitting={updateTrailer.isPending}
      showSuccess={showSuccessState}
      resizable
      entityType="trailer"
    >
      <div className="space-y-5">
        {/* Trailer Information */}
        <SheetSection icon={Truck} title="Trailer Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-unitNumber">Unit Number *</Label>
              <Input
                id="edit-unitNumber"
                value={formData.unitNumber}
                onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                placeholder="e.g. TRL-101"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-equipmentType">Equipment Type *</Label>
              <Select
                value={formData.equipmentType}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) => setFormData({ ...formData, equipmentType: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {TRAILER_EQUIPMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="edit-vin">VIN</Label>
              <Input
                id="edit-vin"
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase().replace(/\s/g, '') })}
                placeholder="17-character VIN"
                maxLength={17}
              />
              {formData.vin && formData.vin.length > 0 && formData.vin.length !== 17 && (
                <p className="text-xs text-muted-foreground mt-1">{formData.vin.length}/17 characters</p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-ownershipType">Ownership</Label>
              <Select
                value={formData.ownershipType || 'none'}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) =>
                  setFormData({ ...formData, ownershipType: value === 'none' ? undefined : (value as any) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ownership" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {OWNERSHIP_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="edit-make">Make</Label>
              <Input
                id="edit-make"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                placeholder="e.g. Wabash"
              />
            </div>
            <div>
              <Label htmlFor="edit-model">Model</Label>
              <Input
                id="edit-model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="e.g. DuraPlate"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="edit-year">Year</Label>
              <Input
                id="edit-year"
                type="number"
                min="1900"
                max={new Date().getFullYear() + 2}
                value={formData.year || ''}
                onChange={(e) =>
                  setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })
                }
                placeholder="e.g. 2024"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="edit-licensePlate">License Plate</Label>
              <Input
                id="edit-licensePlate"
                value={formData.licensePlate}
                onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                placeholder="e.g. ABC-1234"
              />
            </div>
            <div>
              <Label htmlFor="edit-licensePlateState">State</Label>
              <Select
                value={formData.licensePlateState || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, licensePlateState: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {US_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SheetSection>

        {/* Equipment Specs */}
        <SheetSection icon={Ruler} title="Equipment Specs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-lengthFeet">Length (ft)</Label>
              <Input
                id="edit-lengthFeet"
                type="number"
                min="20"
                max="60"
                value={formData.lengthFeet || ''}
                onChange={(e) =>
                  setFormData({ ...formData, lengthFeet: e.target.value ? parseInt(e.target.value) : undefined })
                }
                placeholder="e.g. 53"
              />
            </div>
            <div>
              <Label htmlFor="edit-maxPayloadLbs">Max Payload (lbs)</Label>
              <Input
                id="edit-maxPayloadLbs"
                type="number"
                min="0"
                value={formData.maxPayloadLbs || ''}
                onChange={(e) =>
                  setFormData({ ...formData, maxPayloadLbs: e.target.value ? parseInt(e.target.value) : undefined })
                }
                placeholder="e.g. 45000"
              />
            </div>
          </div>
        </SheetSection>

        {/* Reefer Section (conditional) */}
        {formData.equipmentType === 'REEFER' && (
          <SheetSection icon={Snowflake} title="Reefer Unit">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-reeferMake">Reefer Make</Label>
                <Input
                  id="edit-reeferMake"
                  value={formData.reeferMake}
                  onChange={(e) => setFormData({ ...formData, reeferMake: e.target.value })}
                  placeholder="e.g. Carrier"
                />
              </div>
              <div>
                <Label htmlFor="edit-reeferModel">Reefer Model</Label>
                <Input
                  id="edit-reeferModel"
                  value={formData.reeferModel}
                  onChange={(e) => setFormData({ ...formData, reeferModel: e.target.value })}
                  placeholder="e.g. X4 7500"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="edit-reeferSerial">Reefer Serial</Label>
              <Input
                id="edit-reeferSerial"
                value={formData.reeferSerial}
                onChange={(e) => setFormData({ ...formData, reeferSerial: e.target.value })}
                placeholder="Serial number"
              />
            </div>
          </SheetSection>
        )}

        {/* Compliance */}
        <SheetSection icon={Shield} title="Compliance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-registrationExpiry">Registration Expiry</Label>
              <Input
                id="edit-registrationExpiry"
                type="date"
                value={formData.registrationExpiry || ''}
                onChange={(e) => setFormData({ ...formData, registrationExpiry: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-insuranceExpiry">Insurance Expiry</Label>
              <Input
                id="edit-insuranceExpiry"
                type="date"
                value={formData.insuranceExpiry || ''}
                onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="edit-annualInspectionDate">Last Annual Inspection</Label>
              <Input
                id="edit-annualInspectionDate"
                type="date"
                value={formData.annualInspectionDate || ''}
                onChange={(e) => setFormData({ ...formData, annualInspectionDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-nextMaintenanceDate">Next Maintenance Due</Label>
              <Input
                id="edit-nextMaintenanceDate"
                type="date"
                value={formData.nextMaintenanceDate || ''}
                onChange={(e) => setFormData({ ...formData, nextMaintenanceDate: e.target.value })}
              />
            </div>
          </div>
        </SheetSection>

        {/* Notes */}
        <SheetSection icon={FileText} title="Notes" defaultOpen={!!formData.notes}>
          <div>
            <Label htmlFor="edit-trailer-notes" className="sr-only">
              Notes
            </Label>
            <Textarea
              id="edit-trailer-notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Add notes about this trailer..."
            />
          </div>
        </SheetSection>
      </div>
    </FormSheet>
  );
}
