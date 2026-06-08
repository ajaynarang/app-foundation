'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';

interface ControlPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFormData: (data: any) => void;
  onRunEngine: () => void;
  isRunning: boolean;
}

export function ControlPanel({ formData, setFormData, onRunEngine, isRunning }: ControlPanelProps) {
  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>REST Optimizer Control Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="driverId">Driver ID</Label>
          <Input id="driverId" value={formData.driverId} onChange={(e) => handleChange('driverId', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hoursDriven">Hours Driven</Label>
          <Input
            id="hoursDriven"
            type="number"
            step="0.1"
            value={formData.hoursDriven}
            onChange={(e) => handleChange('hoursDriven', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="onDutyTime">On-Duty Time</Label>
          <Input
            id="onDutyTime"
            type="number"
            step="0.1"
            value={formData.onDutyTime}
            onChange={(e) => handleChange('onDutyTime', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="hoursSinceBreak">Hours Since Break</Label>
          <Input
            id="hoursSinceBreak"
            type="number"
            step="0.1"
            value={formData.hoursSinceBreak}
            onChange={(e) => handleChange('hoursSinceBreak', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dockDurationHours">Dock Duration (hours)</Label>
          <Input
            id="dockDurationHours"
            type="number"
            step="0.1"
            value={formData.dockDurationHours}
            onChange={(e) => handleChange('dockDurationHours', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dockLocation">Dock Location</Label>
          <Input
            id="dockLocation"
            value={formData.dockLocation}
            onChange={(e) => handleChange('dockLocation', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="remainingDistanceMiles">Remaining Distance (miles)</Label>
          <Input
            id="remainingDistanceMiles"
            type="number"
            step="1"
            value={formData.remainingDistanceMiles}
            onChange={(e) => handleChange('remainingDistanceMiles', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="destination">Destination</Label>
          <Input
            id="destination"
            value={formData.destination}
            onChange={(e) => handleChange('destination', e.target.value)}
          />
        </div>
        <Button onClick={onRunEngine} disabled={isRunning} className="w-full">
          {isRunning ? 'Running...' : 'Run Optimizer'}
        </Button>
      </CardContent>
    </Card>
  );
}
