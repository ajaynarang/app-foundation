import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Switch } from '@sally/ui/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { LOCATION_TYPES } from '../constants';

export interface LocationFormState {
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

export const INITIAL_LOCATION_FORM: LocationFormState = {
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
};

interface Props {
  form: LocationFormState;
  onChange: (form: LocationFormState) => void;
  autoFocusName?: boolean;
}

export function LocationFormFields({ form, onChange, autoFocusName }: Props) {
  const set = (field: keyof LocationFormState, value: string | boolean) => onChange({ ...form, [field]: value });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Walmart DC #4523"
            autoFocus={autoFocusName}
          />
        </div>
        <div>
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Dallas" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="TX" maxLength={2} />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={form.zipCode}
              onChange={(e) => set('zipCode', e.target.value)}
              placeholder="75201"
              maxLength={10}
            />
          </div>
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.locationType} onValueChange={(v) => set('locationType', v)}>
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

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Facility Contact</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contact Name</Label>
            <Input
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              placeholder="John Smith"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            placeholder="receiving@facility.com"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Operations</h4>
        <div className="flex items-center justify-between">
          <div>
            <Label>Appointment Required</Label>
            <p className="text-xs text-muted-foreground">Drivers must schedule appointments at this facility</p>
          </div>
          <Switch checked={form.appointmentRequired} onCheckedChange={(v) => set('appointmentRequired', v)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Gate codes, dock instructions, special requirements..."
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
