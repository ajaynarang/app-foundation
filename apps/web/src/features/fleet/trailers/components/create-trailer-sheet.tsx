'use client';

import { useState } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';

import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useCreateTrailer } from '../hooks/use-trailers';
import type { CreateTrailerRequest } from '../types';
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

interface CreateTrailerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function CreateTrailerSheet({ open, onOpenChange, onSuccess }: CreateTrailerSheetProps) {
  const createTrailer = useCreateTrailer();
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState<Partial<CreateTrailerRequest>>({
    unitNumber: '',
    equipmentType: undefined,
    vin: '',
    licensePlate: '',
    licensePlateState: '',
    make: '',
    model: '',
    year: undefined,
    lengthFeet: undefined,
    maxPayloadLbs: undefined,
    ownershipType: undefined,
    reeferMake: '',
    reeferModel: '',
    reeferSerial: '',
    registrationExpiry: '',
    insuranceExpiry: '',
    annualInspectionDate: '',
    nextMaintenanceDate: '',
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      unitNumber: '',
      equipmentType: undefined,
      vin: '',
      licensePlate: '',
      licensePlateState: '',
      make: '',
      model: '',
      year: undefined,
      lengthFeet: undefined,
      maxPayloadLbs: undefined,
      ownershipType: undefined,
      reeferMake: '',
      reeferModel: '',
      reeferSerial: '',
      registrationExpiry: '',
      insuranceExpiry: '',
      annualInspectionDate: '',
      nextMaintenanceDate: '',
      notes: '',
    });
  };

  const handleSubmit = () => {
    if (!formData.unitNumber?.trim() || !formData.equipmentType) return;

    const payload: CreateTrailerRequest = {
      unitNumber: formData.unitNumber.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      equipmentType: formData.equipmentType as any,
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

    createTrailer.mutate(payload, {
      onSuccess: () => {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          resetForm();
          onOpenChange(false);
          onSuccess?.();
        }, 500);
      },
    });
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else onOpenChange(newOpen);
      }}
      title="Add Trailer"
      mode="edit"
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      submitLabel="Create"
      isSubmitting={createTrailer.isPending}
      submitDisabled={!formData.unitNumber?.trim() || !formData.equipmentType}
      showSuccess={showSuccess}
      resizable
      entityType="trailer"
    >
      <div className="space-y-5">
        {/* Trailer Information */}
        <SheetSection icon={Truck} title="Trailer Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="unitNumber">Unit Number *</Label>
              <Input
                id="unitNumber"
                value={formData.unitNumber}
                onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                placeholder="e.g. TRL-101"
                required
              />
            </div>
            <div>
              <Label htmlFor="equipmentType">Equipment Type *</Label>
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
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
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
              <Label htmlFor="ownershipType">Ownership</Label>
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
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                placeholder="e.g. Wabash"
              />
            </div>
            <div>
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="e.g. DuraPlate"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
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
              <Label htmlFor="licensePlate">License Plate</Label>
              <Input
                id="licensePlate"
                value={formData.licensePlate}
                onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                placeholder="e.g. ABC-1234"
              />
            </div>
            <div>
              <Label htmlFor="licensePlateState">State</Label>
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
              <Label htmlFor="lengthFeet">Length (ft)</Label>
              <Input
                id="lengthFeet"
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
              <Label htmlFor="maxPayloadLbs">Max Payload (lbs)</Label>
              <Input
                id="maxPayloadLbs"
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
                <Label htmlFor="reeferMake">Reefer Make</Label>
                <Input
                  id="reeferMake"
                  value={formData.reeferMake}
                  onChange={(e) => setFormData({ ...formData, reeferMake: e.target.value })}
                  placeholder="e.g. Carrier"
                />
              </div>
              <div>
                <Label htmlFor="reeferModel">Reefer Model</Label>
                <Input
                  id="reeferModel"
                  value={formData.reeferModel}
                  onChange={(e) => setFormData({ ...formData, reeferModel: e.target.value })}
                  placeholder="e.g. X4 7500"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="reeferSerial">Reefer Serial</Label>
              <Input
                id="reeferSerial"
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
              <Label htmlFor="registrationExpiry">Registration Expiry</Label>
              <Input
                id="registrationExpiry"
                type="date"
                value={formData.registrationExpiry || ''}
                onChange={(e) => setFormData({ ...formData, registrationExpiry: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="insuranceExpiry">Insurance Expiry</Label>
              <Input
                id="insuranceExpiry"
                type="date"
                value={formData.insuranceExpiry || ''}
                onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="annualInspectionDate">Last Annual Inspection</Label>
              <Input
                id="annualInspectionDate"
                type="date"
                value={formData.annualInspectionDate || ''}
                onChange={(e) => setFormData({ ...formData, annualInspectionDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nextMaintenanceDate">Next Maintenance Due</Label>
              <Input
                id="nextMaintenanceDate"
                type="date"
                value={formData.nextMaintenanceDate || ''}
                onChange={(e) => setFormData({ ...formData, nextMaintenanceDate: e.target.value })}
              />
            </div>
          </div>
        </SheetSection>

        {/* Notes */}
        <SheetSection icon={FileText} title="Notes" defaultOpen={false}>
          <div>
            <Label htmlFor="trailer-notes" className="sr-only">
              Notes
            </Label>
            <Textarea
              id="trailer-notes"
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
